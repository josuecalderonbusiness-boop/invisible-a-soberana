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

$new = 'function _podBuildPhrases(words) {
  const phrases = [];
  let cur = [];
  for (let i = 0; i < words.length; i++) {
    cur.push(i);
    const gap = i < words.length-1 ? words[i+1].t - words[i].t : 99;
    if (gap > 0.7 || cur.length >= 4) { phrases.push(cur.slice()); cur = []; }
  }
  if (cur.length > 0) phrases.push(cur);
  return phrases;
}

function _podGetPhraseIdx(phrases, wordIdx) {
  for (let i = 0; i < phrases.length; i++) { if (phrases[i].includes(wordIdx)) return i; }
  return 0;
}

function _podRenderWords(temaNum, words, curIdx) {
  const stage = document.getElementById(''pod-stage-'' + temaNum);
  if (!stage) return;
  const lyricsEl = stage.querySelector(''.pod-lyrics-3'');
  if (!lyricsEl) return;
  if (!stage._phrases) stage._phrases = _podBuildPhrases(words);
  const phrases = stage._phrases;
  const phraseIdx = _podGetPhraseIdx(phrases, curIdx);
  const isGold = w => POD_GOLD.some(g => w.toLowerCase().replace(/[.,!?]/g,'''') === g.toLowerCase());

  const renderPhrase = (pIdx, role) => {
    if (pIdx < 0 || pIdx >= phrases.length) return ''<div style="min-height:32px"></div>'';
    const wIdxs = phrases[pIdx];
    const isActive = role === ''active'';
    let html2 = ''<div style="min-height:'' + (isActive?''48px'':''32px'') + '';display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:2px 0">'';
    wIdxs.forEach(wi => {
      const w = words[wi].w;
      const isCur = isActive && wi === curIdx;
      const gold = isGold(w);
      let color, fsize, fw;
      if (isCur) { color = gold ? ''#D4AF6A'' : ''#FFFFFF''; fsize = ''34px''; fw = ''700''; }
      else if (isActive) { color = gold ? ''rgba(212,175,58,0.35)'' : ''rgba(255,255,255,0.2)''; fsize = ''28px''; fw = ''600''; }
      else if (role===''prev'') { color = ''rgba(255,255,255,0.2)''; fsize = ''20px''; fw = ''600''; }
      else { color = ''rgba(255,255,255,0.08)''; fsize = ''18px''; fw = ''600''; }
      html2 += ''<span style="color:'' + color + '';font-size:'' + fsize + '';font-weight:'' + fw + '';font-family:Playfair Display,serif;transition:all .2s ease;line-height:1.25">'' + w + ''</span>'';
    });
    html2 += ''</div>'';
    return html2;
  };

  lyricsEl.innerHTML = ''<div style="display:flex;flex-direction:column;align-items:flex-start;gap:10px;padding:0 28px;width:100%">''
    + renderPhrase(phraseIdx-1, ''prev'')
    + renderPhrase(phraseIdx, ''active'')
    + renderPhrase(phraseIdx+1, ''next'')
    + ''</div>'';
}'

$content = $content.Replace($old, $new)
$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."