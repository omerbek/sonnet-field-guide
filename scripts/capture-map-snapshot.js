const fs = require("node:fs");
const path = require("node:path");

const input = process.argv[2];
if (!input) throw new Error("Usage: node scripts/capture-map-snapshot.js <trusted-map-json>");
const source = JSON.parse(fs.readFileSync(path.resolve(input), "utf8").replace(/^\uFEFF/, ""));
const snapshot = {
  checked_at: source.checked_at,
  summary: {
    teams: Number(source.summary?.teams) || 0,
    accepted_entries: Number(source.summary?.accepted_entries) || 0,
    visible_ballots: Number(source.summary?.visible_ballots) || 0,
    registered_writers: Number(source.summary?.registered_writers) || null,
    deadline: source.summary?.deadline || "2026-09-18T12:00:00.000Z"
  },
  teams: Array.isArray(source.teams) ? source.teams.map((team) => ({
    game_id: String(team.game_id || "").slice(0, 16),
    poem_room: String(team.poem_room || "").slice(0, 64),
    room_generation: Number(team.room_generation) || 0,
    status: team.submitted ? "submitted" : "allocated",
    submitted: Boolean(team.submitted),
    visible_votes: Number(team.visible_votes) || 0
  })) : [],
  retention_notice: "Bundled aggregate from referee-signed public records. Visible ballots are retention-limited and are not an official tally. Setup observations do not prove vacancies or complete membership."
};
const output = path.join(__dirname, "..", "data", "map-snapshot.json");
fs.writeFileSync(output, `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`Captured ${snapshot.teams.length} aggregate team records without people or social profiles.`);
