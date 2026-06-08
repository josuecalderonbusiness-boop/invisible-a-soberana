$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$old = 'function podToggle(temaNum) {
  const wrap = document.getElementById(''pod-skin-'' + temaNum);
  const playBtn = document.getElementById(''pod-play-'' + temaNum);
  const prog = document.getElementById(''pod-prog-'' + temaNum);
  const wave = document.getElementById(''pod-wave-'' + temaNum);
  if (!wrap) return;

  const audio = document.getElementById(''pod-audio-'' + temaNum);

  if (!wrap._podReady) {
    wrap._podReady = true;
    wrap._playing = false;
    const heights = [8,14,22,18,30,24,36,28,40,32,36,26,32,20,28,16,22,12,18,8,14,22,18,30,24,36,28,40,32,36,26,32,20,28,16];
    wave.innerHTML = '''';
    heights.forEach((h, i) => {
      const bar = document.createElement(''div'');
      bar.className = ''pod-wave-bar'';
      bar.style.height = h + ''px'';
      bar.style.animationDelay = (i * 0.07) + ''s'';
      wave.appendChild(bar);
    });
    const badge = wrap.querySelector(''.pod-skin-badge'');
    if (badge) badge.innerHTML = ''<div class="pod-skin-dot"></div>Reproduciendo'';

    if (audio) {
      audio.addEventListener(''timeupdate'', function() {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        if (prog) prog.style.width = pct + ''%'';
        const timeEl = wrap.querySelector(''.pod-skin-time'');
        if (timeEl) {
          const spans = timeEl.querySelectorAll(''span'');
          if (spans[0]) spans[0].textContent = _podFmtTime(audio.currentTime);
          if (spans[1]) spans[1].textContent = _podFmtTime(audio.duration);
        }
        const allBars = wave.querySelectorAll(''.pod-wave-bar'');
        const playedIdx = Math.floor(pct / 100 * allBars.length);
        allBars.forEach((b, i) => {
          if (i < playedIdx) { b.classList.add(''pod-played''); b.classList.remove(''pod-active''); b.style.animationPlayState = ''paused''; }
          else if (i === playedIdx) { b.classList.remove(''pod-played''); b.classList.add(''pod-active''); b.style.animationPlayState = ''running''; }
          else { b.classList.remove(''pod-played'', ''pod-active''); b.style.animationPlayState = ''running''; }
        });
      });

      audio.addEventListener(''ended'', function() {
        wrap._playing = false;
        if (playBtn) playBtn.innerHTML = ''<svg width="26" height="26" viewBox="0 0 24 24" fill="#0F0A0B" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>'';
        wave.querySelectorAll(''.pod-wave-bar'').forEach(b => { b.style.animationPlayState = ''paused''; });
        const revealScreen = document.getElementById(''pod-reveal-'' + temaNum);
        if (revealScreen) {
          setTimeout(function() { revealScreen.classList.add(''visible''); }, 600);
        }
      });
    }
  }

  wrap._playing = !wrap._playing;

  const pauseIcon = ''<svg width="26" height="26" viewBox="0 0 24 24" fill="#0F0A0B" stroke="none"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>'';
  const playIcon = ''<svg width="26" height="26" viewBox="0 0 24 24" fill="#0F0A0B" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>'';
  if (playBtn) playBtn.innerHTML = wrap._playing ? pauseIcon : playIcon;

  wave.querySelectorAll(''.pod-wave-bar'').forEach(b => { b.style.animationPlayState = wrap._playing ? ''running'' : ''paused''; });

  const badge = wrap.querySelector(''.pod-skin-badge'');
  if (badge) badge.innerHTML = wrap._playing
    ? ''<div class="pod-skin-dot"></div>Reproduciendo''
    : ''<div class="pod-skin-dot"></div>Pausado'';

  if (navigator.vibrate) navigator.vibrate(8);

  if (audio) {
    if (wrap._playing) { audio.play().catch(() => {}); }
    else { audio.pause(); }
  }
}

function _podFmtTime(secs) {
  if (!secs || isNaN(secs)) return ''0:00'';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + '':'' + (s < 10 ? ''0'' : '''') + s;
}'

$new = 'function _parseSRT(text) {
  const blocks = text.trim().split(/\n\n+/);
  const lines = [];
  blocks.forEach(b => {
    const parts = b.trim().split(''\n'');
    if (parts.length < 3) return;
    const time = parts[1].split('' --> '')[0];
    const hms = time.replace('','',''.''). split('':'');
    const secs = parseInt(hms[0])*3600 + parseInt(hms[1])*60 + parseFloat(hms[2]);
    const txt = parts.slice(2).join('' '').trim();
    if (lines.length > 0 && secs - lines[lines.length-1].t < 1.5) {
      lines[lines.length-1].txt += '' '' + txt;
    } else {
      lines.push({t: Math.round(secs*100)/100, txt});
    }
  });
  return lines;
}

function _podGetIdx(lines, time) {
  let cur = 0;
  for (let i = 0; i < lines.length; i++) { if (time >= lines[i].t) cur = i; else break; }
  return cur;
}

function _podRenderLines(temaNum, lines, idx) {
  const past = document.getElementById(''pod-past-'' + temaNum);
  const active = document.getElementById(''pod-active-'' + temaNum);
  const next = document.getElementById(''pod-next-'' + temaNum);
  if (past) past.textContent = idx > 0 ? lines[idx-1].txt : '''';
  if (active && active.textContent !== lines[idx].txt) {
    active.style.opacity = ''0'';
    setTimeout(() => { active.textContent = lines[idx].txt; active.style.opacity = ''1''; }, 150);
  }
  if (next) next.textContent = idx < lines.length-1 ? lines[idx+1].txt : '''';
}

function _podInitCanvas(temaNum) {
  const canvas = document.getElementById(''pod-canvas-'' + temaNum);
  if (!canvas || canvas._podInit) return;
  canvas._podInit = true;
  const stage = document.getElementById(''pod-stage-'' + temaNum);
  canvas.width = stage ? stage.offsetWidth : 340;
  canvas.height = 340;
  const ctx = canvas.getContext(''2d'');
  const pts = Array.from({length:40}, () => ({
    x: Math.random()*canvas.width, y: Math.random()*canvas.height,
    r: Math.random()*1.4+0.3, vy: -(Math.random()*0.4+0.15),
    vx: (Math.random()-.5)*0.2, a: Math.random()*0.5+0.15, p: Math.random()*Math.PI*2
  }));
  (function frame() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pts.forEach(p => {
      p.p+=.02; p.y+=p.vy; p.x+=p.vx;
      if(p.y<-4){p.y=canvas.height+4;p.x=Math.random()*canvas.width;}
      if(p.x<0||p.x>canvas.width) p.vx*=-1;
      const a=p.a*(0.5+0.5*Math.sin(p.p));
      ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
      ctx.fillStyle=''rgba(212,175,58,''+a+'')'';ctx.fill();
    });
    if(document.getElementById(''pod-canvas-''+temaNum)) requestAnimationFrame(frame);
  })();
}

function podToggle(temaNum) {
  const wrap = document.getElementById(''pod-skin-'' + temaNum);
  const playBtn = document.getElementById(''pod-play-'' + temaNum);
  const prog = document.getElementById(''pod-prog-'' + temaNum);
  const wave = document.getElementById(''pod-wave-'' + temaNum);
  if (!wrap) return;

  _podInitCanvas(temaNum);
  const audio = document.getElementById(''pod-audio-'' + temaNum);

  if (!wrap._podReady) {
    wrap._podReady = true;
    wrap._playing = false;
    wrap._srtLines = [];
    const heights = [8,14,22,18,30,24,36,28,40,32,36,26,32,20,28,16,22,12,18,8,14,22,18,30,24,36,28,40,32,36,26,32,20,28,16];
    wave.innerHTML = '''';
    heights.forEach((h, i) => {
      const bar = document.createElement(''div'');
      bar.className = ''pod-wave-bar'';
      bar.style.height = h + ''px'';
      bar.style.animationDelay = (i * 0.07) + ''s'';
      wave.appendChild(bar);
    });

    const srtUrl = ''https://firebasestorage.googleapis.com/v0/b/soberana-app.firebasestorage.app/o/podcast%2Fleccion_9%2FPodcast-1-leccion9_volalto.srt?alt=media&token=4dabe723-ff29-491a-bf84-d6f776e6ec3a'';
    fetch(srtUrl).then(r => r.text()).then(txt => {
      wrap._srtLines = _parseSRT(txt);
      if (wrap._srtLines.length > 0) _podRenderLines(temaNum, wrap._srtLines, 0);
    }).catch(() => {});

    if (audio) {
      audio.addEventListener(''timeupdate'', function() {
        if (!audio.duration) return;
        const pct = (audio.currentTime / audio.duration) * 100;
        if (prog) prog.style.width = pct + ''%'';
        const curEl = document.getElementById(''pod-cur-'' + temaNum);
        const durEl = document.getElementById(''pod-dur-'' + temaNum);
        if (curEl) curEl.textContent = _podFmtTime(audio.currentTime);
        if (durEl) durEl.textContent = _podFmtTime(audio.duration);
        const allBars = wave.querySelectorAll(''.pod-wave-bar'');
        const playedIdx = Math.floor(pct / 100 * allBars.length);
        allBars.forEach((b, i) => {
          if (i < playedIdx) { b.classList.add(''pod-played''); b.classList.remove(''pod-active''); b.style.animationPlayState = ''paused''; }
          else if (i === playedIdx) { b.classList.remove(''pod-played''); b.classList.add(''pod-active''); b.style.animationPlayState = ''running''; }
          else { b.classList.remove(''pod-played'', ''pod-active''); b.style.animationPlayState = ''running''; }
        });
        if (wrap._srtLines && wrap._srtLines.length > 0) {
          _podRenderLines(temaNum, wrap._srtLines, _podGetIdx(wrap._srtLines, audio.currentTime));
        }
      });

      audio.addEventListener(''ended'', function() {
        wrap._playing = false;
        if (playBtn) playBtn.innerHTML = ''<svg width="26" height="26" viewBox="0 0 24 24" fill="#0F0A0B" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>'';
        wave.querySelectorAll(''.pod-wave-bar'').forEach(b => { b.style.animationPlayState = ''paused''; });
        const revealScreen = document.getElementById(''pod-reveal-'' + temaNum);
        if (revealScreen) setTimeout(function() { revealScreen.classList.add(''visible''); }, 600);
      });
    }
  }

  wrap._playing = !wrap._playing;

  const pauseIcon = ''<svg width="26" height="26" viewBox="0 0 24 24" fill="#0F0A0B" stroke="none"><rect x="5" y="3" width="4" height="18" rx="1"/><rect x="15" y="3" width="4" height="18" rx="1"/></svg>'';
  const playIcon = ''<svg width="26" height="26" viewBox="0 0 24 24" fill="#0F0A0B" stroke="none"><polygon points="5,3 19,12 5,21"/></svg>'';
  if (playBtn) playBtn.innerHTML = wrap._playing ? pauseIcon : playIcon;

  wave.querySelectorAll(''.pod-wave-bar'').forEach(b => { b.style.animationPlayState = wrap._playing ? ''running'' : ''paused''; });

  if (navigator.vibrate) navigator.vibrate(8);

  if (audio) {
    if (wrap._playing) { audio.play().catch(() => {}); }
    else { audio.pause(); }
  }
}

function _podFmtTime(secs) {
  if (!secs || isNaN(secs)) return ''0:00'';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + '':'' + (s < 10 ? ''0'' : '''') + s;
}'

$content = $content.Replace($old, $new)
$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."