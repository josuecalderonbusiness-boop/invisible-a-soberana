$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$old = 'function _podRenderWords(temaNum, words, curIdx) {
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
}'

$new = 'function _podRenderWords(temaNum, words, curIdx) {
  const stage = document.getElementById(''pod-stage-'' + temaNum);
  if (!stage) return;
  let lyricsEl = stage.querySelector(''.pod-lyrics-3'');
  if (!lyricsEl) return;

  const total = words.length;
  const w2 = curIdx > 1 ? words[curIdx-2].w : '''';
  const w1 = curIdx > 0 ? words[curIdx-1].w : '''';
  const w0 = words[curIdx] ? words[curIdx].w : '''';
  const w3 = curIdx < total-1 ? words[curIdx+1].w : '''';
  const w4 = curIdx < total-2 ? words[curIdx+2].w : '''';

  const isGold = w => POD_GOLD.some(g => w.toLowerCase().replace(/[.,!?]/g,'''') === g.toLowerCase());

  const mkWord = (w, role) => {
    if (!w) return '''';
    let color, fontSize, opacity;
    if (role === ''active'') {
      color = isGold(w) ? ''#D4AF6A'' : ''#FFFFFF'';
      fontSize = ''38px'';
      opacity = ''1'';
    } else if (role === ''near'') {
      color = isGold(w) ? ''rgba(212,175,58,0.45)'' : ''rgba(255,255,255,0.3)'';
      fontSize = ''26px'';
      opacity = ''1'';
    } else {
      color = isGold(w) ? ''rgba(212,175,58,0.2)'' : ''rgba(255,255,255,0.1)'';
      fontSize = ''20px'';
      opacity = ''1'';
    }
    return ''<span style="color:'' + color + '';font-size:'' + fontSize + '';opacity:'' + opacity + '';margin:0 5px;transition:all .25s ease;display:inline-block;line-height:1.3;font-weight:700;font-family:Playfair Display,serif">'' + w + ''</span>'';
  };

  const html = ''<div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:0 28px;width:100%">''
    + ''<div style="min-height:32px">'' + mkWord(w2, ''far'') + mkWord(w1, ''near'') + ''</div>''
    + ''<div style="min-height:48px">'' + mkWord(w0, ''active'') + ''</div>''
    + ''<div style="min-height:28px">'' + mkWord(w3, ''near'') + mkWord(w4, ''far'') + ''</div>''
    + ''</div>'';

  lyricsEl.innerHTML = html;
}'

$content = $content.Replace($old, $new)
$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."