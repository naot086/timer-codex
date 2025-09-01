(() => {
  const el = {
    h: document.getElementById('hours'),
    m: document.getElementById('minutes'),
    s: document.getElementById('seconds'),
    time: document.getElementById('time'),
    bar: document.getElementById('bar'),
    start: document.getElementById('start'),
    pause: document.getElementById('pause'),
    reset: document.getElementById('reset'),
    sound: document.getElementById('sound'),
    bgwhite: document.getElementById('bgwhite'),
    modeTimer: document.getElementById('mode-timer'),
    modeStopwatch: document.getElementById('mode-stopwatch'),
    lap: document.getElementById('lap'),
    laps: document.getElementById('laps'),
  };

  const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

  // Timer state
  let totalMs = 5 * 60 * 1000; // default 5 minutes
  let remainingMs = totalMs;
  let running = false;
  let rafId = null;
  let lastTs = 0;
  let finishedOnce = false;

  // Stopwatch state
  let swRunning = false;
  let swRafId = null;
  let swLastTs = 0;
  let swElapsedMs = 0;
  /** @type {{total:number, split:number}[]} */
  let swLaps = [];

  // Load last duration if available
  try {
    const saved = localStorage.getItem('timer.durationMs');
    if (saved) {
      totalMs = Math.max(0, parseInt(saved, 10));
      remainingMs = totalMs;
      setInputsFromMs(totalMs);
    } else {
      setInputsFromMs(totalMs);
    }
  } catch { setInputsFromMs(totalMs); }

  // Load theme preference (white background)
  try {
    const theme = localStorage.getItem('timer.theme');
    if (theme === 'light') {
      document.body.dataset.theme = 'light';
      if (el.bgwhite) el.bgwhite.checked = true;
    }
  } catch {}

  function getDurationMsFromInputs() {
    const hh = clamp(parseInt(el.h.value || '0', 10) || 0, 0, 23);
    const mm = clamp(parseInt(el.m.value || '0', 10) || 0, 0, 59);
    const ss = clamp(parseInt(el.s.value || '0', 10) || 0, 0, 59);
    el.h.value = String(hh);
    el.m.value = String(mm);
    el.s.value = String(ss);
    return ((hh * 60 + mm) * 60 + ss) * 1000;
  }

  function setInputsFromMs(ms) {
    const totalSec = Math.floor(ms / 1000);
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    el.h.value = String(hh);
    el.m.value = String(mm);
    el.s.value = String(ss);
  }

  function fmt(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(t / 3600);
    const mm = Math.floor((t % 3600) / 60);
    const ss = t % 60;
    const HH = String(hh).padStart(2, '0');
    const MM = String(mm).padStart(2, '0');
    const SS = String(ss).padStart(2, '0');
    return `${HH}:${MM}:${SS}`;
  }

  function fmtSw(ms) {
    const t = Math.max(0, Math.floor(ms / 1000));
    const hh = Math.floor(t / 3600);
    const mm = Math.floor((t % 3600) / 60);
    const ss = t % 60;
    const cs = Math.floor((ms % 1000) / 10); // centiseconds
    const HH = String(hh).padStart(2, '0');
    const MM = String(mm).padStart(2, '0');
    const SS = String(ss).padStart(2, '0');
    const CS = String(cs).padStart(2, '0');
    return `${HH}:${MM}:${SS}.${CS}`;
  }

  function updateUI() {
    const mode = document.body.dataset.mode || 'timer';
    if (mode === 'timer') {
      el.time.textContent = fmt(remainingMs);
      const pct = totalMs > 0 ? ((totalMs - remainingMs) / totalMs) * 100 : 0;
      el.bar.style.width = `${clamp(pct, 0, 100)}%`;
      el.start.textContent = '開始';
      el.start.disabled = running || totalMs <= 0;
      el.pause.disabled = !running && remainingMs === totalMs;
      el.reset.disabled = remainingMs === totalMs && !running;
      el.lap.disabled = true;
      el.pause.textContent = running ? '一時停止' : '再開';
    } else {
      el.time.textContent = fmtSw(swElapsedMs);
      el.bar.style.width = '0%';
      el.start.textContent = '開始';
      el.start.disabled = swRunning;
      el.pause.disabled = !swRunning && swElapsedMs === 0;
      el.reset.disabled = !swRunning && swElapsedMs === 0;
      el.lap.disabled = !swRunning;
      el.pause.textContent = swRunning ? '一時停止' : '再開';
      renderLaps();
    }
  }

  function renderLaps() {
    if (!el.laps) return;
    el.laps.innerHTML = '';
    swLaps.forEach((lap, i) => {
      const li = document.createElement('li');
      const no = document.createElement('span');
      no.className = 'lap-no';
      no.textContent = `Lap ${i + 1}`;
      const split = document.createElement('span');
      split.className = 'lap-split';
      split.textContent = `+${fmtSw(lap.split)}`;
      const total = document.createElement('span');
      total.className = 'lap-total';
      total.textContent = fmtSw(lap.total);
      li.appendChild(no);
      li.appendChild(split);
      li.appendChild(total);
      el.laps.appendChild(li);
    });
  }

  function start() {
    totalMs = getDurationMsFromInputs();
    remainingMs = totalMs;
    if (totalMs <= 0) { updateUI(); return; }
    try { localStorage.setItem('timer.durationMs', String(totalMs)); } catch {}
    running = true; finishedOnce = false; lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
    updateUI();
  }

  function pause() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    updateUI();
  }

  function resume() {
    if (remainingMs <= 0) return;
    running = true; lastTs = performance.now();
    rafId = requestAnimationFrame(tick);
    updateUI();
  }

  function reset() {
    pause();
    remainingMs = totalMs;
    updateUI();
  }

  function finish() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    remainingMs = 0;
    updateUI();
    if (el.sound.checked) beep();
    notify('タイマー終了', '時間になりました');
  }

  function tick(ts) {
    if (!running) return;
    const dt = ts - lastTs; // ms
    lastTs = ts;
    const prev = remainingMs;
    remainingMs = Math.max(0, remainingMs - dt);
    if (prev > 0 && remainingMs === 0 && !finishedOnce) {
      finishedOnce = true;
      finish();
      return;
    }
    updateUI();
    rafId = requestAnimationFrame(tick);
  }

  // Stopwatch functions
  function swStart() {
    swElapsedMs = 0;
    swLaps = [];
    swRunning = true;
    swLastTs = performance.now();
    swRafId = requestAnimationFrame(swTick);
    document.getElementById('laps-section')?.removeAttribute('hidden');
    updateUI();
  }
  function swPause() {
    swRunning = false;
    if (swRafId) { cancelAnimationFrame(swRafId); swRafId = null; }
    updateUI();
  }
  function swResume() {
    if (!swRunning) {
      swRunning = true;
      swLastTs = performance.now();
      swRafId = requestAnimationFrame(swTick);
      updateUI();
    }
  }
  function swReset() {
    swPause();
    swElapsedMs = 0;
    swLaps = [];
    updateUI();
  }
  function swLap() {
    if (!swRunning) return;
    const prevTotal = swLaps.length ? swLaps[swLaps.length - 1].total : 0;
    const split = swElapsedMs - prevTotal;
    swLaps.push({ total: swElapsedMs, split });
    document.getElementById('laps-section')?.removeAttribute('hidden');
    renderLaps();
  }
  function swTick(ts) {
    if (!swRunning) return;
    const dt = ts - swLastTs;
    swLastTs = ts;
    swElapsedMs += dt;
    updateUI();
    swRafId = requestAnimationFrame(swTick);
  }

  // Simple beep sequence using Web Audio API
  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const sequence = [0, 0.3, 0.6];
      sequence.forEach((offset, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const freq = i === 2 ? 880 : 660;
        osc.frequency.value = freq;
        gain.gain.value = 0.0001;
        osc.connect(gain).connect(ctx.destination);
        const t0 = now + offset;
        const t1 = t0 + 0.2;
        gain.gain.setValueAtTime(0.0001, t0);
        gain.gain.exponentialRampToValueAtTime(0.3, t0 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t1);
        osc.start(t0);
        osc.stop(t1 + 0.02);
      });
    } catch {}
  }

  function notify(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try { new Notification(title, { body }); } catch {}
    } else if (Notification.permission === 'default') {
      // ask lazily on first finish
      Notification.requestPermission().then(p => {
        if (p === 'granted') { try { new Notification(title, { body }); } catch {} }
      }).catch(() => {});
    }
  }

  // Event wiring
  function isTimerMode() { return (document.body.dataset.mode || 'timer') === 'timer'; }

  el.start.addEventListener('click', () => {
    if (isTimerMode()) start(); else swStart();
  });
  el.pause.addEventListener('click', () => {
    if (isTimerMode()) { if (running) pause(); else resume(); }
    else { if (swRunning) swPause(); else swResume(); }
  });
  el.reset.addEventListener('click', () => {
    if (isTimerMode()) reset(); else swReset();
  });
  el.lap?.addEventListener('click', swLap);

  // White background toggle
  el.bgwhite?.addEventListener('change', () => {
    if (el.bgwhite.checked) {
      document.body.dataset.theme = 'light';
      try { localStorage.setItem('timer.theme', 'light'); } catch {}
    } else {
      delete document.body.dataset.theme;
      try { localStorage.removeItem('timer.theme'); } catch {}
    }
  });

  document.querySelectorAll('[data-preset]').forEach(btn => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.getAttribute('data-preset'), 10) || 0; // seconds
      const next = clamp(Math.floor(getDurationMsFromInputs() / 1000) + delta, 0, 23*3600 + 59*60 + 59);
      const ms = next * 1000;
      setInputsFromMs(ms);
      totalMs = ms;
      if (!running) remainingMs = totalMs;
      updateUI();
    });
  });

  [el.h, el.m, el.s].forEach(inp => {
    ['change', 'input'].forEach(ev => inp.addEventListener(ev, () => {
      totalMs = getDurationMsFromInputs();
      if (!running) remainingMs = totalMs;
      updateUI();
    }));
  });

  // Mode switching
  function setMode(mode) {
    if (mode === 'timer') {
      // stop stopwatch loop
      swPause();
      document.body.dataset.mode = 'timer';
      el.modeTimer.classList.add('active');
      el.modeTimer.setAttribute('aria-pressed', 'true');
      el.modeStopwatch.classList.remove('active');
      el.modeStopwatch.setAttribute('aria-pressed', 'false');
    } else {
      // stop timer loop
      pause();
      document.body.dataset.mode = 'stopwatch';
      el.modeStopwatch.classList.add('active');
      el.modeStopwatch.setAttribute('aria-pressed', 'true');
      el.modeTimer.classList.remove('active');
      el.modeTimer.setAttribute('aria-pressed', 'false');
    }
    if (mode === 'stopwatch') {
      document.getElementById('laps-section')?.removeAttribute('hidden');
    }
    updateUI();
  }
  el.modeTimer?.addEventListener('click', () => setMode('timer'));
  el.modeStopwatch?.addEventListener('click', () => setMode('stopwatch'));

  // Keyboard shortcuts: Space start/pause, R reset, Enter start, L lap
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    const timerMode = isTimerMode();
    if (e.code === 'Space') {
      e.preventDefault();
      if (timerMode) {
        if (!running && remainingMs === totalMs) start();
        else if (running) pause(); else resume();
      } else {
        if (!swRunning && swElapsedMs === 0) swStart();
        else if (swRunning) swPause(); else swResume();
      }
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      if (timerMode) reset(); else swReset();
    } else if (e.key === 'Enter') {
      if (timerMode) { if (!running) start(); }
      else { if (!swRunning) swStart(); }
    } else if (e.key.toLowerCase() === 'l') {
      if (!timerMode) { e.preventDefault(); swLap(); }
    }
  });

  updateUI();
})();
