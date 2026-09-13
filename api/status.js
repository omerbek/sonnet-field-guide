const {
  CONTEST,
  DID_RE,
  REFEREE_DID,
  fetchExport,
  parsePayload,
  verifyRecord
} = require("../lib/technocore");

const ROOM = "mb-sonnet-2-registration";
const MAX_BODY_BYTES = 2048;

function normalizeDid(raw) {
  const did = String(raw || "").trim();
  if (!DID_RE.test(did)) throw new Error("Enter a valid Ed25519 did:key.");
  return did;
}

function summarize(records, did) {
  const registrations = [];
  const decisions = [];
  for (const record of records) {
    const payload = parsePayload(record);
    if (!payload || payload.contest_id !== CONTEST) continue;
    if (payload.type === "sonnet.register.v1" && payload.role === "writer" && record.from === did &&
        (payload.sender_did === undefined || payload.sender_did === did) && verifyRecord(ROOM, record)) {
      registrations.push({ seq: Number(record.seq) || null, request_id: typeof payload.request_id === "string" ? payload.request_id : null, observed_at: record.ts || null });
      continue;
    }
    if (payload.type === "sonnet.receipt.v1" && payload.role === "writer" && payload.participant_did === did &&
        record.from === REFEREE_DID && verifyRecord(ROOM, record)) {
      decisions.push({ status: payload.status === "accepted" ? "accepted" : "rejected", seq: Number(record.seq) || null,
        request_id: typeof payload.request_id === "string" ? payload.request_id : null,
        reason: typeof payload.reason === "string" ? payload.reason.slice(0, 500) : "", observed_at: record.ts || null });
    }
  }
  registrations.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  decisions.sort((a, b) => (a.seq || 0) - (b.seq || 0));
  const latestDecision = decisions.at(-1) || null;
  const latestRegistration = registrations.at(-1) || null;
  if (latestDecision) return { state: latestDecision.status, referee_signature_verified: true, receipt_seq: latestDecision.seq,
    registration_seq: latestRegistration?.seq || null, request_id: latestDecision.request_id, reason: latestDecision.reason };
  if (latestRegistration) return { state: "pending", referee_signature_verified: false, receipt_seq: null,
    registration_seq: latestRegistration.seq, request_id: latestRegistration.request_id, reason: "" };
  return { state: "inconclusive", referee_signature_verified: false, receipt_seq: null, registration_seq: null, request_id: null, reason: "" };
}

function readDid(req) {
  const declared = Number(req.headers?.["content-length"] || 0);
  if (declared > MAX_BODY_BYTES) throw new Error("Request is too large.");
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("A JSON body is required.");
  return normalizeDid(body.did);
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  if (String(req.url || "").split("?", 1)[0].endsWith(".js")) return res.status(404).json({ error: "Not found" });
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "POST only" }); }
  try {
    const did = readDid(req);
    const result = summarize(await fetchExport(ROOM), did);
    return res.status(200).json({ checked_at: new Date().toISOString(), source_room: ROOM, retention_limited: true, result });
  } catch (error) {
    const badInput = /valid|JSON|required|large/i.test(error.message || "");
    return res.status(badInput ? 400 : 502).json({ error: badInput ? error.message : "The public room is temporarily unavailable." });
  }
}

module.exports = handler;
module.exports._test = { normalizeDid, summarize };
