(() => {
  "use strict";
  const list = document.querySelector("[data-team-list]");
  if (!list) return;
  const status = document.querySelector("[data-status]");
  const retention = document.querySelector("[data-retention]");
  const filterInput = document.querySelector("[data-filter]");
  const stateInput = document.querySelector("[data-state]");
  const moreButton = document.querySelector("[data-more]");
  const refreshButton = document.querySelector("[data-refresh]");
  const chartButton = document.querySelector("[data-chart-toggle]");
  const chartBox = document.querySelector("[data-chart-box]");
  const canvas = document.querySelector("[data-chart]");
  let data = null;
  let visible = 24;
  let animationFrame = 0;

  const copy = {
    en: { setup: "Setup observed", entry: "Accepted entry", room: "Poem room", generation: "Generation", votes: "Visible ballots", empty: "No observed records match these filters.", bundled: "Bundled aggregate snapshot", refreshed: "Refreshed signed public evidence", failed: "Live refresh failed; the bundled snapshot remains visible." },
    tr: { setup: "Kurulum gözlendi", entry: "Entry kabul edildi", room: "Şiir odası", generation: "Nesil", votes: "Görünen oy", empty: "Bu filtrelerle eşleşen gözlenmiş kayıt yok.", bundled: "Paketlenmiş toplu snapshot", refreshed: "İmzalı açık kanıt yenilendi", failed: "Canlı yenileme başarısız; paketlenmiş snapshot görünmeye devam ediyor." }
  };
  const lang = () => document.documentElement.lang === "tr" ? "tr" : "en";

  function setText(selector, value) { const element = document.querySelector(selector); if (element) element.textContent = value ?? "—"; }
  function updateStats() {
    setText('[data-stat="teams"]', data?.summary?.teams);
    setText('[data-stat="entries"]', data?.summary?.accepted_entries);
    setText('[data-stat="votes"]', data?.summary?.visible_ballots);
    setText('[data-stat="writers"]', data?.summary?.registered_writers);
  }
  function teams() {
    const query = filterInput.value.trim().toLowerCase();
    const state = stateInput.value;
    return (data?.teams || []).filter((team) => (!query || team.game_id.includes(query)) && (state === "all" || team.status === state));
  }
  function render() {
    const words = copy[lang()];
    const filtered = teams();
    list.replaceChildren();
    for (const team of filtered.slice(0, visible)) {
      const article = document.createElement("article"); article.className = "team";
      const heading = document.createElement("h3"); heading.textContent = team.game_id;
      const badge = document.createElement("span"); badge.className = "pill"; badge.textContent = team.submitted ? words.entry : words.setup;
      const details = document.createElement("dl");
      for (const [term, value] of [[words.room, team.poem_room], [words.generation, team.room_generation], [words.votes, team.visible_votes]]) {
        const dt = document.createElement("dt"); dt.textContent = term;
        const dd = document.createElement("dd"); dd.textContent = value ?? "—";
        details.append(dt, dd);
      }
      article.append(heading, badge, details); list.append(article);
    }
    if (!filtered.length) { const empty = document.createElement("p"); empty.className = "team empty"; empty.textContent = words.empty; list.append(empty); }
    moreButton.hidden = filtered.length <= visible;
    retention.textContent = data?.retention_notice || "";
    updateStats();
  }

  async function load(url, live = false) {
    if (live) { refreshButton.disabled = true; status.textContent = lang() === "tr" ? "İmzalı odalar yenileniyor…" : "Refreshing signed rooms…"; }
    try {
      const response = await fetch(url, { cache: live ? "no-store" : "default", credentials: "omit" });
      if (!response.ok) throw new Error("unavailable");
      data = await response.json();
      status.textContent = `${live ? copy[lang()].refreshed : copy[lang()].bundled} · ${new Date(data.checked_at).toLocaleString()}`;
      render();
    } catch {
      status.textContent = live ? copy[lang()].failed : (lang() === "tr" ? "Snapshot kullanılamıyor." : "Snapshot unavailable.");
    } finally { refreshButton.disabled = false; }
  }

  function pointLayouts(count, width, height) {
    const points = [];
    const rows = Math.max(4, Math.ceil(Math.sqrt(count * .55)));
    for (let i = 0; i < count; i += 1) {
      const t = count <= 1 ? .5 : i / (count - 1);
      const angle = Math.PI * (.08 + .84 * t);
      const ring = i % rows;
      const radius = Math.min(width * .43, height * .85) * (.42 + .58 * ring / Math.max(1, rows - 1));
      const assembly = { x: width / 2 + Math.cos(angle) * radius, y: height * .94 - Math.sin(angle) * radius };
      const columns = Math.ceil(Math.sqrt(count * width / height));
      const row = Math.floor(i / columns), column = i % columns;
      const survey = { x: 28 + column * ((width - 56) / Math.max(1, columns - 1)), y: 34 + row * 28 };
      points.push({ assembly, survey });
    }
    return points;
  }
  function animateChart() {
    const teamsData = (data?.teams || []).slice(0, 160);
    if (!teamsData.length || !canvas) return;
    cancelAnimationFrame(animationFrame);
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio)); canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const context = canvas.getContext("2d"); context.scale(ratio, ratio);
    const layouts = pointLayouts(teamsData.length, rect.width, rect.height);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now(), duration = reduced ? 1 : 900;
    const draw = (now) => {
      const raw = Math.min(1, (now - start) / duration); const progress = 1 - Math.pow(1 - raw, 3);
      context.clearRect(0, 0, rect.width, rect.height);
      layouts.forEach((layout, index) => {
        const point = { x: layout.assembly.x + (layout.survey.x - layout.assembly.x) * progress, y: layout.assembly.y + (layout.survey.y - layout.assembly.y) * progress };
        context.beginPath(); context.arc(point.x, point.y, teamsData[index].submitted ? 6 : 4.5, 0, Math.PI * 2);
        context.fillStyle = teamsData[index].submitted ? "#ffd166" : "#c8ff72"; context.fill();
      });
      if (raw < 1) animationFrame = requestAnimationFrame(draw);
    };
    animationFrame = requestAnimationFrame(draw);
  }
  chartButton?.addEventListener("click", () => { chartBox.hidden = false; requestAnimationFrame(animateChart); chartButton.hidden = true; });
  refreshButton?.addEventListener("click", () => load("/api/map", true));
  filterInput?.addEventListener("input", () => { visible = 24; render(); }); stateInput?.addEventListener("change", () => { visible = 24; render(); });
  moreButton?.addEventListener("click", () => { visible += 24; render(); });
  document.addEventListener("sonnet:language", render);
  window.addEventListener("resize", () => { if (!chartBox.hidden) requestAnimationFrame(animateChart); }, { passive: true });
  load("/data/map-snapshot.json");
})();
