const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { _test: status } = require("../api/status.js");
const technocore = require("../lib/technocore.js");

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function encodeBase58(buffer) {
  let number = BigInt(`0x${buffer.toString("hex")}`);
  let output = "";
  while (number > 0n) { output = BASE58[Number(number % 58n)] + output; number /= 58n; }
  for (const byte of buffer) { if (byte !== 0) break; output = `1${output}`; }
  return output || "1";
}
function identity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const der = publicKey.export({ format: "der", type: "spki" });
  const raw = der.subarray(-32);
  return { did: `did:key:z${encodeBase58(Buffer.concat([Buffer.from([0xed, 0x01]), raw]))}`, privateKey };
}

test("exact signed text verifies, while trimmed text does not", () => {
  const signer = identity();
  const room = "test-room";
  const record = { from: signer.did, nonce: 42, text: "exact text ", sig: "" };
  record.sig = crypto.sign(null, Buffer.from(`${room}|42|${record.text}`), signer.privateKey).toString("base64url");
  assert.equal(technocore.verifyRecord(room, record), true);
  assert.equal(technocore.verifyRecord(room, { ...record, text: record.text.trim() }), false);
});

test("DID-only status normalization rejects handles and accepts Ed25519 DIDs", () => {
  const signer = identity();
  assert.equal(status.normalizeDid(` ${signer.did} `), signer.did);
  assert.throws(() => status.normalizeDid("@some_handle"), /valid Ed25519/);
});

test("a valid signed writer request is pending, never accepted without referee proof", () => {
  const signer = identity();
  const payload = JSON.stringify({ type: "sonnet.register.v1", contest_id: "sonnet-2", role: "writer", sender_did: signer.did, request_id: "test-1" });
  const record = { seq: 7, from: signer.did, nonce: 123, text: payload, sig: crypto.sign(null, Buffer.from(`mb-sonnet-2-registration|123|${payload}`), signer.privateKey).toString("base64url") };
  assert.deepEqual(status.summarize([record], signer.did), { state: "pending", referee_signature_verified: false, receipt_seq: null, registration_seq: 7, request_id: "test-1", reason: "" });
});

test("production allowlist contains no server source, research, tests or helpers", () => {
  const dist = path.resolve(__dirname, "..", "dist");
  assert.equal(fs.existsSync(dist), true, "run npm run build before tests");
  const forbidden = ["api", "lib", "research", "test", "scripts", "package.json", "retry_registration.py", "cast_vote.py"];
  for (const name of forbidden) assert.equal(fs.existsSync(path.join(dist, name)), false, `${name} must not be public`);
});

test("every public page has bilingual content and no secret input field", () => {
  const dist = path.resolve(__dirname, "..", "dist");
  for (const file of ["index.html", "teams.html", "guide.html", "studio.html", "about.html"]) {
    const html = fs.readFileSync(path.join(dist, file), "utf8");
    assert.match(html, /data-lang="en"/); assert.match(html, /data-lang="tr"/);
    assert.doesNotMatch(html, /type=["']password/i);
    assert.doesNotMatch(html, /name=["'](?:private|secret|seed|token|passphrase)/i);
  }
});
