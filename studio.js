(() => {
  "use strict";
  const DID_RE = /^did:key:z6Mk[1-9A-HJ-NP-Za-km-z]{44}$/;
  const GAME_RE = /^[a-z0-9][a-z0-9_-]{0,15}$/;
  const form = document.querySelector("[data-studio-form]");
  if (!form) return;
  const tabs = [...document.querySelectorAll("[data-type]")];
  const rosterFields = [...document.querySelectorAll("[data-roster-only]")];
  const members = document.querySelector("[data-members]");
  const output = document.querySelector("[data-output]");
  const error = document.querySelector("[data-error]");
  const bytes = document.querySelector("[data-bytes]");
  const hash = document.querySelector("[data-hash]");
  const copyButton = document.querySelector("[data-copy]");
  const downloadButton = document.querySelector("[data-download]");
  let type = "team";

  const requestId = () => `field-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  function addMember(value = "") {
    if (members.children.length >= 8) return;
    const input = document.createElement("input");
    input.className = "input code"; input.name = "member"; input.autocomplete = "off"; input.spellcheck = false;
    input.placeholder = `DID ${members.children.length + 1}`; input.value = value; input.setAttribute("aria-label", input.placeholder);
    members.append(input);
  }
  function setType(next) {
    type = next;
    tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.type === type)));
    rosterFields.forEach((field) => { field.hidden = type !== "roster"; });
    output.value = ""; bytes.textContent = "0 bytes"; hash.textContent = "SHA-256 —";
    copyButton.disabled = true; downloadButton.disabled = true; error.textContent = "";
  }
  function values() {
    const gameId = form.elements.game.value.trim();
    const id = form.elements.request.value.trim();
    if (!GAME_RE.test(gameId)) throw new Error("Game ID must match [a-z0-9][a-z0-9_-]{0,15}.");
    if (!id || id.length > 96 || /[\r\n]/.test(id)) throw new Error("Use a fresh single-line request ID (1–96 characters).");
    if (type === "team") return { type: "sonnet.team-request.v1", contest_id: "sonnet-2", game_id: gameId, request_id: id };
    if (type === "withdraw") return { type: "sonnet.withdraw.v1", contest_id: "sonnet-2", game_id: gameId, request_id: id };
    const room = form.elements.room.value.trim();
    const expectedRoom = `d-sonnet-2-team-${gameId}`;
    const generation = Number(form.elements.generation.value);
    const dids = [...form.elements.member].map((input) => input.value.trim());
    if (room !== expectedRoom) throw new Error(`Poem room must be ${expectedRoom}.`);
    if (!Number.isInteger(generation) || generation < 0 || generation > 2147483647) throw new Error("Enter the actual non-negative room generation from the setup receipt.");
    if (dids.length < 4 || dids.length > 8 || dids.some((did) => !DID_RE.test(did))) throw new Error("Enter 4–8 valid Ed25519 did:key member values.");
    if (new Set(dids).size !== dids.length) throw new Error("Every roster member DID must be distinct.");
    return { type: "sonnet.roster.v1", contest_id: "sonnet-2", game_id: gameId, poem_room: room, room_generation: generation, members: dids, request_id: id };
  }
  async function updateOutput(payload) {
    const text = JSON.stringify(payload);
    const encoded = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", encoded);
    const digestHex = [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
    output.value = text; bytes.textContent = `${encoded.byteLength} UTF-8 bytes`; hash.textContent = `SHA-256 ${digestHex}`;
    copyButton.disabled = false; downloadButton.disabled = false;
  }

  for (let index = 0; index < 4; index += 1) addMember();
  form.elements.request.value = requestId();
  tabs.forEach((tab) => tab.addEventListener("click", () => setType(tab.dataset.type)));
  document.querySelector("[data-new-id]").addEventListener("click", () => { form.elements.request.value = requestId(); });
  document.querySelector("[data-add-member]").addEventListener("click", () => addMember());
  document.querySelector("[data-remove-member]").addEventListener("click", () => { if (members.children.length > 4) members.lastElementChild.remove(); });
  form.elements.game.addEventListener("input", () => { if (type === "roster") form.elements.room.value = `d-sonnet-2-team-${form.elements.game.value.trim()}`; });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); error.textContent = "";
    try { await updateOutput(values()); } catch (cause) { error.textContent = cause.message; output.value = ""; copyButton.disabled = true; downloadButton.disabled = true; }
  });
  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(output.value);
    copyButton.textContent = document.documentElement.lang === "tr" ? "Kopyalandı" : "Copied";
    setTimeout(() => { copyButton.textContent = document.documentElement.lang === "tr" ? "Tam metni kopyala" : "Copy exact text"; }, 1300);
  });
  downloadButton.addEventListener("click", () => {
    const blob = new Blob([output.value], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `${form.elements.game.value || "sonnet"}-${type}.json`; link.click(); URL.revokeObjectURL(link.href);
  });
  setType("team");
})();
