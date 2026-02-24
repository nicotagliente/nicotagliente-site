// Single-page link hub (no build tools needed)
const $ = (sel) => document.querySelector(sel);

async function loadData(){
  const res = await fetch('./data.json', { cache: 'no-store' });
  if(!res.ok) throw new Error('Unable to load data.json');
  return await res.json();
}

function renderLinks(links){
  const root = $('#links');
  root.innerHTML = '';
  links.forEach((l) => {
    const a = document.createElement('a');
    a.className = 'btn';
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('role','listitem');
    a.innerHTML = `
      <span class="label">${escapeHtml(l.label)}</span>
      <span class="hint">${escapeHtml(l.hint || 'open')}</span>
    `;
    root.appendChild(a);
  });
}

function renderScores(scores, q=''){
  const root = $('#scores');
  const query = q.trim().toLowerCase();
  root.innerHTML = '';

  const filtered = scores.filter(s => {
    const hay = (s.title + ' ' + (s.description||'') + ' ' + (s.tags||[]).join(' ')).toLowerCase();
    return !query || hay.includes(query);
  });

  if(filtered.length === 0){
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'Nessun risultato. Prova un’altra parola.';
    root.appendChild(p);
    return;
  }

  filtered.forEach(s => {
    const div = document.createElement('div');
    div.className = 'score';
    div.setAttribute('role','listitem');
    const tags = (s.tags || []).slice(0,3).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join('');
    div.innerHTML = `
      <div class="meta">
        <p class="title">${escapeHtml(s.title)}</p>
        <p class="desc">${escapeHtml(s.description || '')}</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
          ${tags}
        </div>
      </div>
      <a class="pill" href="${escapeAttr(s.file)}" target="_blank" rel="noopener noreferrer">PDF ↗</a>
    `;
    root.appendChild(div);
  });
}

function escapeHtml(str=''){
  return String(str)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}
function escapeAttr(str=''){ return escapeHtml(str).replaceAll('`','&#096;'); }

(async function init(){
  // silent entry
  window.addEventListener('DOMContentLoaded', () => { document.body.classList.add('is-ready'); });

  try{
    const data = await loadData();

    // Header
    $('#name').textContent = data.profile?.name ?? 'Nico';
    $('#name2').textContent = data.profile?.name ?? 'Nico';
    const kickerEl = document.getElementById('kicker');
    const kicker = (data.profile?.kicker ?? '').trim();
    if(kickerEl){
      if(kicker){
        kickerEl.textContent = kicker;
        kickerEl.style.display = '';
      }else{
        kickerEl.textContent = '';
        kickerEl.style.display = 'none';
      }
    }
    $('#tagline').textContent = data.profile?.tagline ?? 'Music / Performances / Bio';
    document.title = `${data.profile?.name ?? 'Nico'} — Links`;

    // Bio
    const bioEl = document.getElementById('bio');
    if(bioEl){ bioEl.textContent = (data.profile?.bio || '').trim(); }
    $('#year').textContent = new Date().getFullYear();

    // Variable typography scaling on scroll (very controlled)
    const nameEl = document.getElementById('name');
    const onScroll = () => {
      const y = Math.min(520, Math.max(0, window.scrollY || 0));
      const t = 1 - (y / 520) * 0.14; // down to 0.86
      document.documentElement.style.setProperty('--titleScale', t.toFixed(3));
    };
    window.addEventListener('scroll', onScroll, {passive:true});
    onScroll();


    // Email (optional)
    const email = (data.profile?.email || '').trim();
    const emailEl = document.getElementById('emailLink');
    const sepEl = document.getElementById('emailSep');
    if(email && emailEl){
      emailEl.href = `mailto:${email}`;
      emailEl.textContent = email;
      emailEl.style.display = 'inline';
      if(sepEl) sepEl.style.display = 'inline';
    }

    // Links + Scores
    renderLinks(data.links || []);
    renderScores(data.scores || []);

    wireListen(data);

    // Search
    const input = $('#scoreSearch');
    input.addEventListener('input', () => renderScores(data.scores || [], input.value));

    // View toggle
    const btn = $('#toggleView');
    btn.addEventListener('click', () => {
      const isTiles = $('#scores').classList.toggle('tiles');
      btn.textContent = `View: ${isTiles ? 'Grid' : 'Lista'}`;
      btn.setAttribute('aria-pressed', String(isTiles));
    });
  }catch(err){
    console.error(err);
    const wrap = $('#content');
    const box = document.createElement('div');
    box.className = 'panel';
    box.innerHTML = `<h2>Errore</h2><p class="muted">Non riesco a caricare <code>data.json</code>. Check that it exists and that the site is served over HTTP (not opened as a local file).</p>`;
    wrap.prepend(box);
  }
})();


/* =================== AudioReactive =================== */
class AudioReactive {
  constructor(){
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.stream = null;
    this.enabled = false;
    this.raf = null;
    this.smooth = 0;
  }

  async ensureCtx(){
    if(!this.ctx){
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.85;
    }
  }

  async useMic(){
    await this.ensureCtx();
    if(this.stream) this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.source.connect(this.analyser);
    return true;
  }

  async usePlayer(player){
    await this.ensureCtx();
    if(this.source) try{ this.source.disconnect(); }catch(e){}
    const node = this.ctx.createMediaElementSource(player);
    node.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.source = node;
    return true;
  }

  start(){
    if(!this.analyser || this.enabled) return;
    this.enabled = true;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      if(!this.enabled) return;
      this.analyser.getByteFrequencyData(buf);

      // energy in low-mid band (subtle, musical)
      const start = Math.floor(buf.length * 0.03);
      const end   = Math.floor(buf.length * 0.18);
      let sum = 0;
      for(let i=start;i<end;i++) sum += buf[i];
      const avg = sum / Math.max(1,(end-start)); // 0..255

      // normalize + subthreshold movement
      const v = Math.min(1, Math.max(0, (avg - 18) / 110));
      this.smooth = this.smooth * 0.92 + v * 0.08;

      document.documentElement.style.setProperty('--react', this.smooth.toFixed(4));
      this.raf = requestAnimationFrame(tick);
    };

    this.raf = requestAnimationFrame(tick);
  }

  stop(){
    this.enabled = false;
    if(this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    document.documentElement.style.setProperty('--react', '0');
    if(this.stream){
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }
}




/* =================== LISTEN (one gesture) =================== */
function wireListen(data){
  const btn = document.getElementById('listenBtn');
  const audio = document.getElementById('bgAudio');
  const hint = document.getElementById('soundHint');
  if(!btn || !audio) return;

  const src = (data?.profile?.audio_src || '').trim();
  if(!src){
    const panel = document.getElementById('soundPanel');
    if(panel) panel.style.display = 'none';
    return;
  }
  audio.src = src;

  const ar = new AudioReactive();
  let reactiveOn = false;

  const KEY = 'nico_listen_enabled';

  const setUI = (on) => {
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'LISTENING' : 'LISTEN';
    if(hint) hint.textContent = on ? 'On. Sound + subtle reactivity.' : 'One gesture. Sound + subtle reactivity.';
  };

  const start = async () => {
    try{
      await audio.play();
      await ar.attachMediaElement(audio);
      ar.start();
      reactiveOn = true;
      localStorage.setItem(KEY,'1');
      setUI(true);
    }catch(e){
      setUI(false);
      if(hint) hint.textContent = 'Click once more (browser permission).';
    }
  };

  const stop = () => {
    audio.pause();
    if(reactiveOn){ ar.stop(); reactiveOn = false; }
    localStorage.removeItem(KEY);
    setUI(false);
  };

  btn.addEventListener('click', () => {
    const on = btn.getAttribute('aria-pressed') === 'true';
    if(on) stop();
    else start();
  });

  if(localStorage.getItem(KEY)==='1'){
    start();
  }else{
    setUI(false);
  }
}
