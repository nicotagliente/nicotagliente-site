const $ = (sel) => document.querySelector(sel);

async function loadData(){
  const res = await fetch('./data.json', { cache: 'no-store' });
  if(!res.ok) throw new Error('data.json not found');
  return await res.json();
}

function renderLinks(links){
  const wrap = $('#links');
  wrap.innerHTML = '';
  (links || []).forEach((l) => {
    const a = document.createElement('a');
    a.href = l.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.className = 'link-pill';
    a.textContent = l.label;
    wrap.appendChild(a);
  });
}

function renderScores(scores){
  const out = $('#scores');
  const q = ($('#scoreSearch').value || '').trim().toLowerCase();

  out.innerHTML = '';
  (scores || [])
    .filter(s => {
      const text = `${s.title || ''} ${s.description || ''} ${(s.tags || []).join(' ')}`.toLowerCase();
      return !q || text.includes(q);
    })
    .forEach(s => {
      const row = document.createElement('div');
      row.className = 'score';

      const meta = document.createElement('div');
      meta.className = 'meta';

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = s.title || 'Score';

      const desc = document.createElement('div');
      desc.className = 'desc';
      desc.textContent = s.description || '';

      meta.appendChild(title);
      meta.appendChild(desc);

      const a = document.createElement('a');
      a.href = s.file;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'Open';

      row.appendChild(meta);
      row.appendChild(a);

      out.appendChild(row);
    });
}

/* ========= Optional Audio Accent (best-effort, never required) ========= */
class AudioAccent {
  constructor(){
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.raf = null;
    this.smooth = 0;
  }

  async tryAttach(el){
    try{
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      await this.ctx.resume();

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.85;

      // Safari: createMediaElementSource only once per element
      if(!el.__mediaSourceNode){
        el.__mediaSourceNode = this.ctx.createMediaElementSource(el);
      }
      this.source = el.__mediaSourceNode;

      try{ this.source.disconnect(); }catch(e){}
      this.source.connect(this.analyser);

      // keep graph alive without doubling sound
      const g = this.ctx.createGain();
      g.gain.value = 0.00001;
      this.analyser.connect(g);
      g.connect(this.ctx.destination);

      return true;
    }catch(e){
      return false;
    }
  }

  start(){
    if(!this.analyser) return;
    const buf = new Uint8Array(this.analyser.frequencyBinCount);

    const tick = () => {
      this.analyser.getByteFrequencyData(buf);

      // low-mid energy
      let sum = 0;
      const s = Math.floor(buf.length * 0.04);
      const e = Math.floor(buf.length * 0.20);
      for(let i=s;i<e;i++) sum += buf[i];
      const avg = sum / Math.max(1, (e-s));

      const v = Math.min(1, Math.max(0, (avg - 10) / 140));
      this.smooth = this.smooth * 0.92 + v * 0.08;

      // set accent variable: 0..1 (CSS reads it)
      document.documentElement.style.setProperty('--accent', this.smooth.toFixed(4));

      this.raf = requestAnimationFrame(tick);
    };

    this.raf = requestAnimationFrame(tick);
  }

  stop(){
    if(this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    document.documentElement.style.setProperty('--accent', '0');
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
  audio.volume = typeof data?.profile?.audio_volume === 'number' ? data.profile.audio_volume : 0.75;
  audio.loop = true;

  const accent = new AudioAccent();
  let accentReady = false;
  let on = false;

  const setUI = () => {
    btn.setAttribute('aria-pressed', String(on));
    btn.textContent = on ? 'LISTENING' : 'LISTEN';
    if(hint){
      hint.textContent = on
        ? (accentReady ? 'On. Breathing + audio accent.' : 'On. Breathing (audio accent unavailable).')
        : 'One gesture. Sound + subtle reactivity.';
    }
  };

  btn.addEventListener('click', async () => {
    try{
      if(!on){
        await audio.play();

        // best effort: attach analyser AFTER play for iOS stability
        accentReady = await accent.tryAttach(audio);
        if(accentReady) accent.start();

        on = true;
        setUI();
      }else{
        audio.pause();
        accent.stop();
        on = false;
        setUI();
      }
    }catch(e){
      if(hint) hint.textContent = 'Audio blocked. Tap again or raise volume.';
    }
  });

  setUI();
}

/* =================== INIT =================== */
(async function init(){
  try{
    const data = await loadData();

    document.title = `${data.profile?.name ?? 'Nico Tagliente'} — Links`;
    $('#name').textContent = data.profile?.name ?? 'Nico Tagliente';
    $('#tagline').textContent = data.profile?.tagline ?? 'Music / Performances / Bio';
    $('#bio').textContent = (data.profile?.bio || '').trim();
    $('#year').textContent = new Date().getFullYear();

    renderLinks(data.links || []);
    renderScores(data.scores || []);
    $('#scoreSearch').addEventListener('input', () => renderScores(data.scores || []));

    wireListen(data);
  }catch(e){
    console.log(e);
    $('#bio').textContent = 'Update data.json in the repository.';
  }
})();
