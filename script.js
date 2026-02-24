// nicotagliente-site — stable script (links + scores + listen)
// No AudioContext. No reactive. No side effects.

const $ = (sel) => document.querySelector(sel);

async function loadData() {
  const res = await fetch("./data.json", { cache: "no-store" });
  if (!res.ok) throw new Error("data.json not found");
  return await res.json();
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

function renderLinks(links) {
  const wrap = document.getElementById("links");
  if (!wrap) return;

  wrap.innerHTML = "";
  (links || []).forEach((l) => {
    if (!l?.url || !l?.label) return;

    const a = document.createElement("a");
    a.href = l.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.className = "link-pill";
    a.textContent = l.label;

    wrap.appendChild(a);
  });
}

function renderScores(scores, query = "") {
  const out = document.getElementById("scores");
  if (!out) return;

  const q = (query || "").trim().toLowerCase();
  out.innerHTML = "";

  (scores || [])
    .filter((s) => {
      const text = `${s?.title || ""} ${s?.description || ""} ${(s?.tags || []).join(" ")}`.toLowerCase();
      return !q || text.includes(q);
    })
    .forEach((s) => {
      if (!s?.file) return;

      const row = document.createElement("div");
      row.className = "score";

      const meta = document.createElement("div");
      meta.className = "meta";

      const title = document.createElement("div");
      title.className = "title";
      title.textContent = s.title || "Score";

      const desc = document.createElement("div");
      desc.className = "desc";
      desc.textContent = s.description || "";

      meta.appendChild(title);
      meta.appendChild(desc);

      const a = document.createElement("a");
      a.href = s.file;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Open";

      row.appendChild(meta);
      row.appendChild(a);

      out.appendChild(row);
    });
}

function wireListen(data) {
  const btn = document.getElementById("listenBtn");
  const audio = document.getElementById("bgAudio");
  const hint = document.getElementById("soundHint");
  const panel = document.getElementById("soundPanel");

  if (!btn || !audio) return;

  const src = (data?.profile?.audio_src || "").trim();
  if (!src) {
    if (panel) panel.style.display = "none";
    return;
  }

  audio.src = src;
  audio.loop = true;
  audio.preload = "auto";
  audio.playsInline = true;

  const vol =
    typeof data?.profile?.audio_volume === "number"
      ? data.profile.audio_volume
      : 0.75;
  audio.volume = vol;

  let playing = false;

  const setUI = (msg) => {
    btn.setAttribute("aria-pressed", String(playing));
    btn.textContent = playing ? "LISTENING" : "LISTEN";
    if (hint) hint.textContent = msg || (playing ? "On." : "Tap LISTEN.");
  };

  btn.addEventListener("click", async () => {
    try {
      if (!playing) {
        audio.volume = vol; // re-apply on gesture (Safari-friendly)
        const p = audio.play();
        if (p && typeof p.then === "function") await p;

        playing = true;
        setUI("On.");
      } else {
        audio.pause();
        playing = false;
        setUI("Stopped.");
      }
    } catch (e) {
      console.log("LISTEN error:", e);
      setUI("Audio blocked — tap again.");
    }
  });

  setUI();
}

(async function init() {
  try {
    const data = await loadData();

    setText("name", data?.profile?.name || "Nico Tagliente");
    setText("tagline", data?.profile?.tagline || "Music / Performances / Bio");
    setText("bio", (data?.profile?.bio || "").trim());
    setText("year", new Date().getFullYear());

    renderLinks(data.links || []);
    renderScores(data.scores || [], "");

    const search = document.getElementById("scoreSearch");
    if (search) {
      search.addEventListener("input", () => {
        renderScores(data.scores || [], search.value);
      });
    }

    wireListen(data);
  } catch (e) {
    console.log(e);
    const bio = document.getElementById("bio");
    if (bio) bio.textContent = "Update data.json in the repository.";
  }
})();
// entrance fade
window.addEventListener("load", () => {
  document.body.classList.add("is-loaded");
});
// scroll detection for title compression

