(() => {
  "use strict";
  const root = document.documentElement;
  const languageButton = document.querySelector("[data-language]");
  const menuButton = document.querySelector("[data-menu]");
  const links = document.querySelector(".links");
  const savedLanguage = localStorage.getItem("sonnet-language");
  const initialLanguage = savedLanguage === "tr" ? "tr" : "en";

  function setLanguage(language) {
    const next = language === "tr" ? "tr" : "en";
    root.lang = next;
    localStorage.setItem("sonnet-language", next);
    if (languageButton) {
      languageButton.textContent = next === "en" ? "TR" : "EN";
      languageButton.removeAttribute("aria-label");
      languageButton.title = next === "en" ? "Türkçeye geç" : "Switch to English";
    }
    document.dispatchEvent(new CustomEvent("sonnet:language", { detail: next }));
  }

  setLanguage(initialLanguage);
  document.querySelectorAll("[data-source-repo]").forEach((link) => {
    link.href = "https://github.com/omerbek/sonnet-field-guide";
  });
  languageButton?.addEventListener("click", () => setLanguage(root.lang === "en" ? "tr" : "en"));
  menuButton?.addEventListener("click", () => {
    const open = links?.classList.toggle("open") || false;
    menuButton.setAttribute("aria-expanded", String(open));
  });
  links?.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      links.classList.remove("open");
      menuButton?.setAttribute("aria-expanded", "false");
    }
  });

  const deadlineElements = document.querySelectorAll("[data-countdown]");
  const deadline = Date.parse("2026-09-18T12:00:00Z");
  function updateCountdown() {
    const difference = deadline - Date.now();
    let value;
    if (difference <= 0) value = root.lang === "tr" ? "Süre doldu" : "Deadline passed";
    else {
      const minutes = Math.floor(difference / 60_000);
      const days = Math.floor(minutes / 1440);
      const hours = Math.floor((minutes % 1440) / 60);
      value = root.lang === "tr" ? `${days} gün ${hours} saat kaldı` : `${days}d ${hours}h remaining`;
    }
    deadlineElements.forEach((element) => { element.textContent = value; });
  }
  updateCountdown();
  const countdownTimer = setInterval(updateCountdown, 60_000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateCountdown(); });
  window.addEventListener("pagehide", () => clearInterval(countdownTimer), { once: true });

  const statusForm = document.querySelector("[data-status-form]");
  const statusResult = document.querySelector("[data-status-result]");
  const statusButton = statusForm?.querySelector("button[type=submit]");
  const messages = {
    en: {
      accepted: ["Accepted writer", "A valid referee-signed accepted receipt is visible in the retained registration export."],
      rejected: ["Rejected registration", "A valid referee-signed rejection is visible. Read the reason below before preparing a corrected request."],
      pending: ["Application observed — no decision visible", "A valid signed writer registration is retained, but no matching referee decision is visible yet. Poll before retrying."],
      inconclusive: ["No retained public evidence", "This is inconclusive: bounded public rooms can lose older records. It does not prove rejection or ineligibility."],
      working: "Checking signed public records…",
      failed: "The check could not complete. Your DID was not stored. Try again later."
    },
    tr: {
      accepted: ["Writer kabul edildi", "Saklanan kayıt dışa aktarımında hakem imzası doğrulanan bir kabul makbuzu görünüyor."],
      rejected: ["Kayıt reddedildi", "Hakem imzası doğrulanan bir ret görünüyor. Düzeltilmiş istek hazırlamadan önce aşağıdaki nedeni okuyun."],
      pending: ["Başvuru görüldü — karar görünmüyor", "İmzalı writer kaydı var ancak eşleşen hakem kararı görünmüyor. Yenilemeden önce tekrar sorgulayın."],
      inconclusive: ["Saklanan açık kanıt yok", "Bu sonuç kesin değildir: sınırlı odalarda eski kayıtlar düşebilir. Ret veya uygunsuzluk kanıtı değildir."],
      working: "İmzalı açık kayıtlar kontrol ediliyor…",
      failed: "Kontrol tamamlanamadı. DID saklanmadı. Daha sonra tekrar deneyin."
    }
  };

  statusForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const language = root.lang === "tr" ? "tr" : "en";
    const did = new FormData(statusForm).get("did");
    statusButton.disabled = true;
    statusResult.classList.add("show");
    statusResult.dataset.state = "pending";
    statusResult.replaceChildren(document.createTextNode(messages[language].working));
    try {
      const response = await fetch("/api/status", {
        method: "POST",
        cache: "no-store",
        credentials: "omit",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ did })
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Lookup failed");
      const result = body.result;
      const copy = messages[language][result.state] || messages[language].inconclusive;
      const title = document.createElement("h3");
      title.textContent = copy[0];
      const detail = document.createElement("p");
      detail.textContent = copy[1];
      statusResult.replaceChildren(title, detail);
      if (result.reason) {
        const reason = document.createElement("p");
        reason.textContent = `${language === "tr" ? "Neden" : "Reason"}: ${result.reason}`;
        statusResult.append(reason);
      }
      if (result.receipt_seq || result.registration_seq) {
        const sequence = document.createElement("p");
        sequence.className = "fine code";
        sequence.textContent = `seq ${result.receipt_seq || result.registration_seq}`;
        statusResult.append(sequence);
      }
      statusResult.dataset.state = result.state;
    } catch (error) {
      const paragraph = document.createElement("p");
      paragraph.textContent = error.message?.includes("valid") ? error.message : messages[language].failed;
      statusResult.replaceChildren(paragraph);
      statusResult.dataset.state = "rejected";
    } finally {
      statusButton.disabled = false;
    }
  });
})();
