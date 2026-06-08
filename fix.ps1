$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

# Cambio 1: reemplazar _podGetIdx y _podRenderLines para word-level
$old1 = 'function _podGetIdx(lines, time) {
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
}'

$new1 = 'function _podGetWordIdx(words, time) {
  let cur = 0;
  for (let i = 0; i < words.length; i++) { if (time >= words[i].t) cur = i; else break; }
  return cur;
}

const POD_GOLD = [''quiebre'',''irreversible'',''influencia'',''soberana'',''eres'',''ERES'',''mental'',''emocional'',''relacional'',''creencias'',''siete'',''techo'',''arrastra'',''elegir'',''autoridad''];

function _podWordHtml(word, isActive) {
  const isGold = POD_GOLD.some(g => word.toLowerCase().replace(/[.,]/g,'''') === g.toLowerCase());
  const color = isGold ? ''#D4AF6A'' : (isActive ? ''#FFFFFF'' : ''rgba(255,255,255,0.18)'');
  const size = isActive ? ''36px'' : ''22px'';
  return ''<span style="color:'' + color + '';font-size:'' + size + '';transition:all .2s ease;margin-right:6px;line-height:1.3;display:inline-block">'' + word + ''</span>'';
}

function _podRenderWords(temaNum, words, curIdx) {
  const active = document.getElementById(''pod-active-'' + temaNum);
  const past = document.getElementById(''pod-past-'' + temaNum);
  const next = document.getElementById(''pod-next-'' + temaNum);
  if (!active) return;

  // Palabra actual resaltada
  const curWord = words[curIdx] ? words[curIdx].w : '''';
  const prevWord = curIdx > 0 ? words[curIdx-1].w : '''';
  const nextWord = curIdx < words.length-1 ? words[curIdx+1].w : '''';

  if (past) past.innerHTML = _podWordHtml(prevWord, false);
  active.innerHTML = _podWordHtml(curWord, true);
  if (next) next.innerHTML = _podWordHtml(nextWord, false);
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
}'

$content = $content.Replace($old1, $new1)

# Cambio 2: usar _wordData en timeupdate
$old2 = '        if (wrap._srtLines && wrap._srtLines.length > 0) {
          _podRenderLines(temaNum, wrap._srtLines, _podGetIdx(wrap._srtLines, audio.currentTime));
        }'

$new2 = '        if (wrap._wordData && wrap._wordData.length > 0) {
          _podRenderWords(temaNum, wrap._wordData, _podGetWordIdx(wrap._wordData, audio.currentTime));
        } else if (wrap._srtLines && wrap._srtLines.length > 0) {
          _podRenderLines(temaNum, wrap._srtLines, _podGetIdx(wrap._srtLines, audio.currentTime));
        }'

$content = $content.Replace($old2, $new2)

$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."