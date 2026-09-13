const {
  CONTEST,
  REFEREE_DID,
  fetchExport,
  parsePayload,
  verifyRecord
} = require("../lib/technocore");

const RESULTS = "d-sonnet-2-results";
const SUBMISSIONS = "mb-sonnet-2-submissions";
const VOTES = "mb-sonnet-2-votes";
const RULES = "d-sonnet-2-rules";

function trustedRefereePayload(room, record) {
  if (record.from !== REFEREE_DID || !verifyRecord(room, record)) return null;
  const payload = parsePayload(record);
  return payload?.contest_id === CONTEST ? payload : null;
}

function buildMap(results, submissions, votes, rules) {
  const teams = new Map();
  for (const record of results) {
    const payload = trustedRefereePayload(RESULTS, record);
    if (!payload || !["sonnet.setup.v1", "sonnet.resetup.v1"].includes(payload.type)) continue;
    if (typeof payload.game_id !== "string" || typeof payload.poem_room !== "string") continue;
    teams.set(payload.game_id, {
      game_id: payload.game_id,
      poem_room: payload.poem_room,
      room_generation: Number(payload.room_generation) || 1,
      setup_seq: Number(record.seq) || null,
      setup_at: record.ts || null,
      status: "allocated",
      submitted: false,
      visible_votes: 0
    });
  }

  const submitRequests = new Map();
  for (const record of submissions) {
    const payload = parsePayload(record);
    if (payload?.type === "sonnet.submit.v1" && payload.contest_id === CONTEST && verifyRecord(SUBMISSIONS, record)) {
      submitRequests.set(payload.request_id, payload);
    }
  }

  const entries = new Map();
  for (const record of submissions) {
    const payload = trustedRefereePayload(SUBMISSIONS, record);
    if (!payload || payload.type !== "sonnet.receipt.v1" || payload.status !== "accepted" || typeof payload.entry_id !== "string") continue;
    const submitted = submitRequests.get(payload.request_id) || {};
    const entry = {
      entry_id: payload.entry_id,
      game_id: submitted.game_id || payload.entry_id,
      poem_room: submitted.poem_room || `d-sonnet-2-team-${payload.entry_id}`,
      final_version: Number(submitted.final_version) || null,
      poem_sha256: submitted.poem_sha256 || null,
      receipt_seq: Number(record.seq) || null,
      accepted_at: record.ts || null,
      visible_votes: 0
    };
    entries.set(entry.entry_id, entry);
    const team = teams.get(entry.game_id);
    if (team) {
      team.status = "submitted";
      team.submitted = true;
      team.entry_id = entry.entry_id;
      team.final_version = entry.final_version;
    }
  }

  // The votes room is bounded. This is the latest ballot per voter that is still
  // publicly visible, not a claim of the referee's complete durable tally.
  const latestVisibleBallot = new Map();
  for (const record of votes) {
    const payload = trustedRefereePayload(VOTES, record);
    if (!payload || payload.type !== "sonnet.receipt.v1" || payload.status !== "accepted") continue;
    if (typeof payload.entry_id !== "string" || typeof payload.sender_did !== "string") continue;
    latestVisibleBallot.set(payload.sender_did, payload.entry_id);
  }
  for (const entryId of latestVisibleBallot.values()) {
    const entry = entries.get(entryId);
    if (entry) entry.visible_votes += 1;
    const team = teams.get(entry?.game_id || entryId);
    if (team) team.visible_votes += 1;
  }

  let notice = null;
  let deadline = "2026-09-18T12:00:00.000Z";
  for (const record of rules) {
    const payload = trustedRefereePayload(RULES, record);
    if (!payload) continue;
    if (payload.type === "sonnet.launch.v1" && Number(payload.configuration?.deadline)) {
      deadline = new Date(Number(payload.configuration.deadline) * 1000).toISOString();
    }
    if (payload.type === "sonnet.notice.v1") notice = payload;
  }

  const orderedEntries = [...entries.values()].sort((a, b) => b.visible_votes - a.visible_votes || a.entry_id.localeCompare(b.entry_id));
  const orderedTeams = [...teams.values()].sort((a, b) => {
    if (a.submitted !== b.submitted) return Number(b.submitted) - Number(a.submitted);
    return (b.setup_seq || 0) - (a.setup_seq || 0);
  });

  return {
    summary: {
      teams: orderedTeams.length,
      accepted_entries: orderedEntries.length,
      visible_ballots: latestVisibleBallot.size,
      registered_writers: Number(notice?.participants?.writer) || null,
      deadline
    },
    teams: orderedTeams,
    entries: orderedEntries,
    retention_notice: "Visible ballot counts cover only referee-accepted ballots still present in the bounded public export. Setup and accepted-entry counts reflect referee-signed records observed in their public rooms; they are not a vacancy or eligibility oracle."
  };
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (String(req.url || "").split("?", 1)[0].endsWith(".js")) return res.status(404).json({ error: "Not found" });
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });
  const rooms = [RESULTS, SUBMISSIONS, VOTES, RULES];
  const settled = await Promise.allSettled(rooms.map((room) => fetchExport(room)));
  const warnings = [];
  const records = settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    warnings.push(`${rooms[index]}: ${result.reason?.message || "unavailable"}`);
    return [];
  });
  if (!records[0].length) return res.status(502).json({ error: "Official results room unavailable", warnings });
  return res.status(200).json({
    checked_at: new Date().toISOString(),
    referee_did: REFEREE_DID,
    warnings,
    ...buildMap(...records)
  });
}

module.exports = handler;
module.exports._test = { buildMap };
