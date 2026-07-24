/* Bali Phrases — vanilla JS, no deps */
(() => {
  "use strict";

  const LS_KEY = "bali-ratings-v1";
  const state = {
    scenes: [],
    cards: [],
    patterns: {},
    tab: "list",
    practice: null, // { queue, index, revealed, sceneId }
    ratings: loadRatings(),
  };

  const $view = document.getElementById("view");

  // ---------- storage ----------
  function loadRatings() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {};
    } catch {
      return {};
    }
  }
  function saveRating(cardId, r) {
    const arr = state.ratings[cardId] || [];
    arr.push({ r, t: Date.now() });
    state.ratings[cardId] = arr.slice(-5); // keep last 5
    localStorage.setItem(LS_KEY, JSON.stringify(state.ratings));
  }
  // weight: unseen 3 / recent avg ○=1 △=2 ×=4
  function cardWeight(cardId) {
    const arr = state.ratings[cardId];
    if (!arr || arr.length === 0) return 3;
    const recent = arr.slice(-3);
    const map = { good: 1, soso: 2, bad: 4 };
    return recent.reduce((s, e) => s + (map[e.r] || 2), 0) / recent.length;
  }
  function isWeak(cardId) {
    return cardWeight(cardId) >= 2.5 && state.ratings[cardId];
  }

  // ---------- tts ----------
  let voices = [];
  function pickVoice() {
    voices = speechSynthesis.getVoices();
    return (
      voices.find(v => v.lang === "en-US" && /Google|Natural/i.test(v.name)) ||
      voices.find(v => v.lang === "en-US") ||
      voices.find(v => v.lang.startsWith("en")) ||
      null
    );
  }
  if ("speechSynthesis" in window) {
    speechSynthesis.onvoiceschanged = pickVoice;
    pickVoice();
  }
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.lang = "en-US";
    u.rate = 0.95;
    speechSynthesis.speak(u);
  }

  // ---------- helpers ----------
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function cardsOf(sceneId) {
    return state.cards.filter(c => c.scene === sceneId);
  }

  // ---------- list view ----------
  function renderList() {
    $view.innerHTML = "";
    state.scenes.forEach(scene => {
      const cards = cardsOf(scene.id);
      const block = el(`
        <section class="scene-block" data-scene="${scene.id}">
          <button class="scene-head">
            <span class="s-icon">${scene.icon}</span>
            <span>
              <span class="s-title">${esc(scene.title)}</span><br>
              <span class="s-desc">${esc(scene.desc)}</span>
            </span>
            <span class="s-count">${cards.length}</span>
          </button>
          <div class="scene-cards"></div>
        </section>`);
      const holder = block.querySelector(".scene-cards");
      cards.forEach(c => holder.appendChild(renderCard(c)));
      block.querySelector(".scene-head").addEventListener("click", () => {
        block.classList.toggle("open");
      });
      $view.appendChild(block);
    });
  }

  function renderCard(c) {
    const p = state.patterns[c.pattern];
    const node = el(`
      <article class="card" id="card-${c.id}">
        ${c.cue ? `<button class="cue"><span class="cue-en">“${esc(c.cue.en)}”</span><span class="cue-ja">${esc(c.cue.ja)}</span></button>` : ""}
        <div class="ja">${esc(c.ja)}</div>
        <div class="best-row">
          <div class="best">${esc(c.best)}</div>
          <button class="speak-btn" aria-label="読み上げ">🔊</button>
        </div>
        <div class="structure">${esc(c.structure)}</div>
        <details>
          <summary>ニュアンス</summary>
          <div class="nuance">${esc(c.nuance)}</div>
        </details>
        ${p ? `<button class="pattern-chip">${esc(p.title)}</button>` : ""}
      </article>`);
    node.querySelector(".speak-btn").addEventListener("click", () => speak(c.best));
    const cueBtn = node.querySelector(".cue");
    if (cueBtn) cueBtn.addEventListener("click", () => speak(c.cue.en));
    const chip = node.querySelector(".pattern-chip");
    if (chip) chip.addEventListener("click", () => showPatterns(c.pattern));
    return node;
  }

  // ---------- practice view ----------
  function renderPracticeSetup() {
    $view.innerHTML = "";
    const weakCount = state.cards.filter(c => isWeak(c.id)).length;
    const wrap = el(`<div class="practice-setup"><h2>どのシーンを練習する？</h2><div class="chip-row"></div><div class="stats-line"></div></div>`);
    const row = wrap.querySelector(".chip-row");

    const allBtn = el(`<button class="chip">🌏 全シーン <span class="cnt">${state.cards.length}</span></button>`);
    allBtn.addEventListener("click", () => startPractice(null));
    row.appendChild(allBtn);

    if (weakCount > 0) {
      const weakBtn = el(`<button class="chip weak">🔥 弱いカード <span class="cnt">${weakCount}</span></button>`);
      weakBtn.addEventListener("click", () => startPractice("weak"));
      row.appendChild(weakBtn);
    }

    state.scenes.forEach(s => {
      const n = cardsOf(s.id).length;
      if (!n) return;
      const b = el(`<button class="chip">${s.icon} ${esc(s.title)} <span class="cnt">${n}</span></button>`);
      b.addEventListener("click", () => startPractice(s.id));
      row.appendChild(b);
    });

    const rated = Object.keys(state.ratings).length;
    wrap.querySelector(".stats-line").textContent =
      rated ? `これまでに ${rated}/${state.cards.length} 枚を練習済み` : "練習の記録はまだないよ。まず1周してみよう";
    $view.appendChild(wrap);
  }

  function startPractice(sceneId) {
    let pool;
    if (sceneId === "weak") pool = state.cards.filter(c => isWeak(c.id));
    else if (sceneId) pool = cardsOf(sceneId);
    else pool = state.cards.slice();
    // weak-first weighted order with random tiebreak
    const queue = pool
      .map(c => ({ c, k: cardWeight(c.id) + Math.random() * 0.8 }))
      .sort((a, b) => b.k - a.k)
      .map(x => x.c);
    state.practice = { queue, index: 0, revealed: false, sceneId, results: [] };
    renderPracticeCard();
  }

  function renderPracticeCard() {
    const p = state.practice;
    if (!p || p.index >= p.queue.length) return renderPracticeDone();
    const c = p.queue[p.index];
    const scene = state.scenes.find(s => s.id === c.scene);
    $view.innerHTML = "";
    const node = el(`
      <div>
        <div class="practice-card">
          <div class="meta">
            <span>${scene ? scene.icon + " " + esc(scene.title) : ""}</span>
            <span>${p.index + 1} / ${p.queue.length}</span>
          </div>
          ${c.cue ? `<button class="cue"><span class="cue-en">“${esc(c.cue.en)}”</span><span class="cue-ja">${esc(c.cue.ja)}</span></button>` : ""}
          <div class="prompt">${esc(c.ja)}</div>
          <div class="hint">${c.cue ? "相手にこう言われた。すぐ声に出して返そう" : "まず声に出して言ってみよう"}</div>
          <div class="answer" hidden>
            <div class="best-row">
              <div class="best">${esc(c.best)}</div>
              <button class="speak-btn">🔊</button>
            </div>
            <div class="structure">${esc(c.structure)}</div>
            <details><summary>ニュアンス</summary><div class="nuance">${esc(c.nuance)}</div></details>
          </div>
          <div class="spacer"></div>
        </div>
        <button class="big-btn">答えを見る</button>
        <div class="rate-row" hidden>
          <button class="r-good">○<span>言えた</span></button>
          <button class="r-soso">△<span>あやしい</span></button>
          <button class="r-bad">×<span>出てこない</span></button>
        </div>
      </div>`);

    const answer = node.querySelector(".answer");
    const revealBtn = node.querySelector(".big-btn");
    const rateRow = node.querySelector(".rate-row");
    const cueBtn = node.querySelector(".cue");
    if (cueBtn) cueBtn.addEventListener("click", () => speak(c.cue.en));
    if (c.cue) speak(c.cue.en); // 相手のセリフを自動再生 — 本番と同じく耳から始める
    revealBtn.addEventListener("click", () => {
      answer.hidden = false;
      revealBtn.hidden = true;
      rateRow.hidden = false;
      speak(c.best);
    });
    node.querySelector(".speak-btn").addEventListener("click", () => speak(c.best));
    const rate = r => {
      saveRating(c.id, r);
      p.results.push(r);
      p.index++;
      renderPracticeCard();
    };
    node.querySelector(".r-good").addEventListener("click", () => rate("good"));
    node.querySelector(".r-soso").addEventListener("click", () => rate("soso"));
    node.querySelector(".r-bad").addEventListener("click", () => rate("bad"));
    $view.appendChild(node);
  }

  function renderPracticeDone() {
    const p = state.practice;
    const good = p.results.filter(r => r === "good").length;
    const soso = p.results.filter(r => r === "soso").length;
    const bad = p.results.filter(r => r === "bad").length;
    $view.innerHTML = "";
    const node = el(`
      <div class="done-box">
        <div class="big">🎉</div>
        <p><strong>${p.results.length}枚 完了！</strong><br>○ ${good}　△ ${soso}　× ${bad}</p>
        <p>${bad + soso > 0 ? "△×のカードは次回、優先的に出てくるよ" : "全部言えた！この調子"}</p>
        <button class="ghost-btn">シーン選択に戻る</button>
      </div>`);
    node.querySelector(".ghost-btn").addEventListener("click", renderPracticeSetup);
    $view.appendChild(node);
  }

  // ---------- patterns view ----------
  function showPatterns(focusKey) {
    setTab("patterns");
    if (focusKey) {
      const target = document.getElementById("pattern-" + focusKey);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        target.classList.add("highlight");
        setTimeout(() => target.classList.remove("highlight"), 1600);
      }
    }
  }

  function renderPatterns() {
    $view.innerHTML = "";
    const wrap = el(`<div class="patterns-view"><h2>シーン横断の文型パターン</h2></div>`);
    Object.entries(state.patterns).forEach(([key, p]) => {
      const count = state.cards.filter(c => c.pattern === key).length;
      const node = el(`
        <article class="pattern-card" id="pattern-${key}">
          <h3>${esc(p.title)}</h3>
          <div class="p-desc">${esc(p.desc)}</div>
          <ul>${p.examples.map(e => `<li>${esc(e)}</li>`).join("")}</ul>
          <div class="p-count">使うカード: ${count}枚</div>
        </article>`);
      node.querySelectorAll("li").forEach((li, i) => {
        li.style.cursor = "pointer";
        li.addEventListener("click", () => speak(p.examples[i]));
      });
      wrap.appendChild(node);
    });
    $view.appendChild(wrap);
  }

  // ---------- tabs ----------
  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll(".tabbar button").forEach(b => {
      b.classList.toggle("active", b.dataset.tab === tab);
    });
    speechSynthesis.cancel?.();
    if (tab === "list") renderList();
    else if (tab === "practice") renderPracticeSetup();
    else renderPatterns();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabbar button").forEach(b => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });

  // ---------- boot ----------
  async function boot() {
    try {
      const [scenes, cards, patterns] = await Promise.all([
        fetch("data/scenes.json").then(r => r.json()),
        fetch("data/cards.json").then(r => r.json()),
        fetch("data/patterns.json").then(r => r.json()),
      ]);
      state.scenes = scenes;
      state.cards = cards;
      state.patterns = patterns;
      setTab("list");
    } catch (e) {
      $view.innerHTML = `<p style="padding:20px;color:#d05446">データの読み込みに失敗: ${esc(e.message)}</p>`;
    }
  }
  boot();

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then(reg => reg.update()).catch(() => {});
    });
    // 新しいSWが有効化されたら即リロードして最新版を表示
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!refreshing) {
        refreshing = true;
        location.reload();
      }
    });
  }
})();
