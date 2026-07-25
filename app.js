/* Bali Phrases — vanilla JS, no deps */
(() => {
  "use strict";

  const LS_KEY = "bali-ratings-v1";
  const state = {
    scenes: [],
    cards: [],
    patterns: {},
    dialogs: [],
    episodes: [],
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

  // お手本→間→お手本… とリピート再生（真似して声に出す用）
  function mimic(text, times = 3) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    let n = 0;
    const go = () => {
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = "en-US";
      u.rate = 0.9;
      u.onend = () => {
        n++;
        if (n < times) setTimeout(go, 2600);
      };
      speechSynthesis.speak(u);
    };
    go();
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
        <div class="ja">${c.prio ? `<span class="prio prio-${c.prio}">${c.prio}</span>` : ""}${esc(c.ja)}</div>
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

    const instantCount = state.cards.filter(c => c.prio === "S" || c.prio === "A").length;
    const instBtn = el(`<button class="chip inst">⚡ 即答トレ S+A <span class="cnt">${instantCount}</span></button>`);
    instBtn.addEventListener("click", () => startPractice("instant"));
    row.appendChild(instBtn);

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
    wrap.querySelector(".stats-line").innerHTML =
      (rated ? `これまでに ${rated}/${state.cards.length} 枚を練習済み` : "練習の記録はまだないよ。まず「⚡即答トレ」から") +
      `<br>優先度: <b>S</b>=毎日何度も <b>A</b>=毎日1〜2回 <b>B</b>=一発勝負 <b>C</b>=翻訳アプリでも可`;
    $view.appendChild(wrap);
  }

  function startPractice(sceneId) {
    let pool;
    if (sceneId === "weak") pool = state.cards.filter(c => isWeak(c.id));
    else if (sceneId === "instant") pool = state.cards.filter(c => c.prio === "S" || c.prio === "A");
    else if (sceneId && sceneId.startsWith("pattern:")) pool = state.cards.filter(c => c.pattern === sceneId.slice(8));
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
            <span>${scene ? scene.icon + " " + esc(scene.title) : ""}${c.prio ? ` <span class="prio prio-${c.prio}">${c.prio}</span>` : ""}</span>
            <span>${p.index + 1} / ${p.queue.length}</span>
          </div>
          ${c.cue ? `<button class="cue"><span class="cue-en">“${esc(c.cue.en)}”</span><span class="cue-ja">${esc(c.cue.ja)}</span></button>` : ""}
          <div class="prompt">${esc(c.ja)}</div>
          <div class="hint">${c.cue ? "相手にこう言われた。すぐ声に出して返そう" : "まず声に出して言ってみよう"}</div>
          <button class="stem-btn">💡 出だしだけ見る</button>
          <div class="answer" hidden>
            <div class="best-row">
              <div class="best">${esc(c.best)}</div>
              <button class="speak-btn">🔊</button>
            </div>
            <button class="mimic-btn">🔁 まねる×3（お手本→自分の順で）</button>
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
    const stemBtn = node.querySelector(".stem-btn");
    stemBtn.addEventListener("click", () => {
      const words = c.best.split(" ");
      const n = Math.min(Math.max(2, Math.ceil(words.length * 0.4)), 4);
      stemBtn.textContent = words.slice(0, n).join(" ") + " …";
      stemBtn.classList.add("revealed");
      stemBtn.disabled = true;
    });
    revealBtn.addEventListener("click", () => {
      answer.hidden = false;
      revealBtn.hidden = true;
      rateRow.hidden = false;
      speak(c.best);
    });
    node.querySelector(".speak-btn").addEventListener("click", () => speak(c.best));
    node.querySelector(".mimic-btn").addEventListener("click", () => mimic(c.best));
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

  // ---------- roleplay view ----------
  function resolveTurn(t) {
    if (t.ref) {
      const c = state.cards.find(c => c.id === t.ref);
      if (c) return { who: "you", ja: c.ja, en: c.best, note: t.note };
    }
    return t;
  }

  function renderRoleplayList() {
    $view.innerHTML = "";
    const wrap = el(`<div class="practice-setup"><h2>シーン別ロールプレイ — 一連の会話を通しで</h2></div>`);
    state.dialogs.forEach(d => {
      const scene = state.scenes.find(s => s.id === d.scene);
      const yours = d.turns.filter(t => t.who === "you" || t.ref).length;
      const b = el(`
        <button class="scene-head" style="margin-bottom:8px">
          <span class="s-icon">${scene ? scene.icon : "🎭"}</span>
          <span>
            <span class="s-title">${esc(d.title)}</span><br>
            <span class="s-desc">あなたの発話 ${yours}回</span>
          </span>
          <span class="s-count">▶ 開始</span>
        </button>`);
      b.addEventListener("click", () => startRoleplay(d));
      wrap.appendChild(b);
    });
    $view.appendChild(wrap);
  }

  function startRoleplay(d) {
    $view.innerHTML = "";
    const wrap = el(`
      <div>
        <div class="rp-head">🎭 ${esc(d.title)}<button class="chip rp-quit">やめる</button></div>
        <div class="rp-chat"></div>
        <div class="rp-controls"></div>
      </div>`);
    $view.appendChild(wrap);
    wrap.querySelector(".rp-quit").addEventListener("click", () => {
      speechSynthesis.cancel?.();
      renderRoleplayList();
    });
    const chat = wrap.querySelector(".rp-chat");
    const controls = wrap.querySelector(".rp-controls");
    const turns = d.turns.map(resolveTurn);
    let i = 0;

    function addBubble(t, side) {
      const b = el(`
        <div class="bubble ${side}">
          <div class="b-en">${esc(t.en)}</div>
          ${side === "staff" ? `<div class="b-ja">${esc(t.ja)}</div>` : ""}
        </div>`);
      b.addEventListener("click", () => speak(t.en));
      chat.appendChild(b);
      speak(t.en);
    }

    function advance() {
      controls.innerHTML = "";
      // 相手のターンを消化（連続はデータ側で作らない前提）
      while (i < turns.length && turns[i].who === "staff") {
        addBubble(turns[i], "staff");
        i++;
      }
      if (i >= turns.length) {
        const done = el(`
          <div class="done-box" style="padding:24px 10px">
            <div class="big">🎉</div>
            <p><strong>ロープレ完了！</strong><br>詰まったフレーズは練習モードで個別に鍛えよう</p>
            <button class="ghost-btn again">もう一度</button>
            <button class="ghost-btn back">一覧へ戻る</button>
          </div>`);
        done.querySelector(".again").addEventListener("click", () => startRoleplay(d));
        done.querySelector(".back").addEventListener("click", renderRoleplayList);
        controls.appendChild(done);
        return;
      }
      const t = turns[i];
      const p = el(`
        <div class="rp-your-turn">
          ${t.note ? `<div class="rp-note">${esc(t.note)}</div>` : ""}
          <div class="rp-prompt">🗣 ${esc(t.ja)}</div>
          <div class="hint">声に出して言ってから確認</div>
          <button class="big-btn">英文を見る</button>
        </div>`);
      p.querySelector(".big-btn").addEventListener("click", () => {
        addBubble(t, "you");
        i++;
        advance();
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
      });
      controls.appendChild(p);
      window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    }
    advance();
  }

  // ---------- listen view ----------
  const player = { audio: null, idx: -1, rate: 1.0 };

  function fmtDur(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  function ensureAudio() {
    if (!player.audio) {
      const a = new Audio();
      a.preload = "none";
      a.addEventListener("ended", () => playEpisode(player.idx + 1));
      a.addEventListener("timeupdate", updateNowPlaying);
      player.audio = a;
    }
    return player.audio;
  }

  function playEpisode(i) {
    if (i < 0 || i >= state.episodes.length) {
      stopEpisode();
      return;
    }
    const ep = state.episodes[i];
    const a = ensureAudio();
    player.idx = i;
    a.src = ep.file;
    a.playbackRate = player.rate;
    a.play();
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: ep.title,
        artist: "Bali Phrases",
        album: "バリ英会話リスニング",
      });
      navigator.mediaSession.setActionHandler("play", () => a.play());
      navigator.mediaSession.setActionHandler("pause", () => a.pause());
      navigator.mediaSession.setActionHandler("previoustrack", () => playEpisode(player.idx - 1));
      navigator.mediaSession.setActionHandler("nexttrack", () => playEpisode(player.idx + 1));
    }
    if (state.tab === "listen") renderListen();
  }

  function stopEpisode() {
    if (player.audio) {
      player.audio.pause();
      player.audio.removeAttribute("src");
    }
    player.idx = -1;
    if (state.tab === "listen") renderListen();
  }

  function updateNowPlaying() {
    const elp = document.querySelector(".ep-item.playing .ep-time");
    if (elp && player.audio && !isNaN(player.audio.currentTime)) {
      const ep = state.episodes[player.idx];
      elp.textContent = `${fmtDur(player.audio.currentTime)} / ${fmtDur(ep.duration)}`;
    }
  }

  function renderListen() {
    $view.innerHTML = "";
    const total = state.episodes.reduce((s, e) => s + e.duration, 0);
    const wrap = el(`
      <div class="practice-setup">
        <h2>🎧 移動中リスニング — 全${state.episodes.length}話 / 約${Math.round(total / 60)}分</h2>
        <p class="stats-line" style="margin:0 2px 10px">通し会話 → キーフレーズ（ゆっくり＋訳）→ もう一度通し、の構成。
        再生中は画面を消してもOK。1話終わると自動で次に進むよ</p>
        <div class="chip-row speed-row"></div>
        <div class="ep-list"></div>
      </div>`);

    const speeds = [0.8, 1.0, 1.25];
    const speedRow = wrap.querySelector(".speed-row");
    speeds.forEach(r => {
      const b = el(`<button class="chip ${player.rate === r ? "inst" : ""}">${r}x</button>`);
      b.addEventListener("click", () => {
        player.rate = r;
        if (player.audio) player.audio.playbackRate = r;
        renderListen();
      });
      speedRow.appendChild(b);
    });

    const list = wrap.querySelector(".ep-list");
    if (!state.episodes.length) {
      list.appendChild(el(`<p class="stats-line">エピソードがまだないよ</p>`));
    }
    state.episodes.forEach((ep, i) => {
      const playing = i === player.idx && player.audio && !player.audio.paused;
      const current = i === player.idx;
      const item = el(`
        <button class="ep-item ${current ? "playing" : ""}">
          <span class="ep-btn">${playing ? "⏸" : "▶"}</span>
          <span class="ep-info">
            <span class="ep-title">${esc(ep.title)}</span>
            <span class="ep-time">${current && player.audio ? fmtDur(player.audio.currentTime) + " / " : ""}${fmtDur(ep.duration)}</span>
          </span>
          <span class="ep-num">${i + 1}</span>
        </button>`);
      item.addEventListener("click", () => {
        if (current && player.audio) {
          if (player.audio.paused) player.audio.play();
          else player.audio.pause();
          renderListen();
        } else {
          playEpisode(i);
        }
      });
      list.appendChild(item);
    });
    $view.appendChild(wrap);
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
      if (count > 0) {
        const drill = el(`<button class="ghost-btn p-drill">この文型でドリル ▶</button>`);
        drill.addEventListener("click", () => {
          document.querySelectorAll(".tabbar button").forEach(b => {
            b.classList.toggle("active", b.dataset.tab === "practice");
          });
          state.tab = "practice";
          startPractice("pattern:" + key);
          window.scrollTo(0, 0);
        });
        node.appendChild(drill);
      }
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
    else if (tab === "roleplay") renderRoleplayList();
    else if (tab === "listen") renderListen();
    else renderPatterns();
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabbar button").forEach(b => {
    b.addEventListener("click", () => setTab(b.dataset.tab));
  });

  // ---------- boot ----------
  async function boot() {
    try {
      const [scenes, cards, patterns, dialogs, episodes] = await Promise.all([
        fetch("data/scenes.json").then(r => r.json()),
        fetch("data/cards.json").then(r => r.json()),
        fetch("data/patterns.json").then(r => r.json()),
        fetch("data/dialogs.json").then(r => r.json()),
        fetch("data/episodes.json").then(r => r.json()).catch(() => []),
      ]);
      state.scenes = scenes;
      state.cards = cards;
      state.patterns = patterns;
      state.dialogs = dialogs;
      state.episodes = episodes;
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
