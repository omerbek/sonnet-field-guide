const crypto = require("node:crypto");

const BASE_URL = "https://technocore.chat";
const CONTEST = "sonnet-2";
const REFEREE_DID = "did:key:z6MkowHQwsx9xr84WbWN3YCnKutyBnBXkT1ChKY4uEAAMzte";
const MAX_EXPORT_BYTES = 64 * 1024 * 1024;
const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const EXPORT_TTL_MS = 45_000;
const EXPORT_STALE_MS = 5 * 60_000;
const publicKeyCache = new Map();
const exportCache = new Map();

function decodeBase58(value) {
  let number = 0n;
  for (const character of value) {
    const index = BASE58.indexOf(character);
    if (index < 0) throw new Error("invalid base58btc character");
    number = number * 58n + BigInt(index);
  }
  let hex = number.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let decoded = number === 0n ? Buffer.alloc(0) : Buffer.from(hex, "hex");
  const leadingZeroes = value.length - value.replace(/^1+/, "").length;
  if (leadingZeroes) decoded = Buffer.concat([Buffer.alloc(leadingZeroes), decoded]);
  return decoded;
}

function publicKeyFromDid(did) {
  if (!DID_RE.test(did)) throw new Error("invalid Ed25519 DID");
  const cached = publicKeyCache.get(did);
  if (cached) return cached;
  const decoded = decodeBase58(did.slice("did:key:z".length));
  if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
    throw new Error("DID is not an Ed25519 public key");
  }
  const publicKey = crypto.createPublicKey({
    key: Buffer.concat([SPKI_ED25519_PREFIX, decoded.subarray(2)]),
    format: "der",
    type: "spki"
  });
  publicKeyCache.set(did, publicKey);
  return publicKey;
}

function parseRecordLine(line) {
  const nonceMatch = /"nonce"\s*:\s*(\d{1,19})(?=\s*[,}])/.exec(line);
  const record = JSON.parse(line);
  if (nonceMatch) record._nonceRaw = nonceMatch[1];
  return record;
}

function parsePayload(record) {
  try {
    const value = JSON.parse(record.text);
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function verifyRecord(room, record) {
  if (!record || typeof record !== "object" || !DID_RE.test(record.from || "")) return false;
  if (typeof record.text !== "string" || typeof record.sig !== "string") return false;
  const nonce = record._nonceRaw || String(record.nonce);
  if (!/^\d{1,19}$/.test(nonce) || !/^[A-Za-z0-9_-]+$/.test(record.sig)) return false;
  try {
    // Verify the exact retained message text; normalization would change the
    // signed bytes and could turn an invalid record into an apparently valid one.
    const payload = Buffer.from(`${room}|${nonce}|${record.text}`, "utf8");
    return crypto.verify(null, payload, publicKeyFromDid(record.from), Buffer.from(record.sig, "base64url"));
  } catch {
    return false;
  }
}

async function fetchExportUncached(room, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}/r/${encodeURIComponent(room)}/export`, {
      signal: controller.signal,
      cache: "no-store",
      headers: { "user-agent": "sableforge-map/1.0" }
    });
    if (!response.ok) throw new Error(`${room}: HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > MAX_EXPORT_BYTES) throw new Error(`${room}: export too large`);
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > MAX_EXPORT_BYTES) throw new Error(`${room}: export too large`);
    const records = [];
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      try {
        const record = parseRecordLine(line);
        if (record && typeof record === "object") records.push(record);
      } catch {
        // Quarantine malformed lines without invalidating unrelated records.
      }
    }
    return records;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchExport(room, timeoutMs = 12_000) {
  const now = Date.now();
  const cached = exportCache.get(room);
  if (cached?.records && now - cached.fetchedAt < EXPORT_TTL_MS) return cached.records;
  if (cached?.inflight) return cached.inflight;

  const inflight = fetchExportUncached(room, timeoutMs)
    .then((records) => {
      exportCache.set(room, { records, fetchedAt: Date.now(), inflight: null });
      return records;
    })
    .catch((error) => {
      if (cached?.records && now - cached.fetchedAt < EXPORT_STALE_MS) return cached.records;
      throw error;
    })
    .finally(() => {
      const current = exportCache.get(room);
      if (current?.inflight === inflight) current.inflight = null;
    });

  exportCache.set(room, {
    records: cached?.records || null,
    fetchedAt: cached?.fetchedAt || 0,
    inflight
  });
  return inflight;
}

module.exports = {
  BASE_URL,
  CONTEST,
  DID_RE,
  REFEREE_DID,
  fetchExport,
  parsePayload,
  verifyRecord
};
