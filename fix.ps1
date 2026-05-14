$path = "public\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

# ── CAMBIO 1: SECCION_COLORES + _hexToRgb antes de NODE_X_PCT ─────────────────
$old1 = 'const NODE_X_PCT = [50, 70, 50, 30, 50, 70, 50, 30, 50, 70]; // s0..s9'
$new1 = 'const SECCION_COLORES = {
  s0:  { accent: ''#3D0C11'', glow: ''rgba(61,12,17,0.55)''   },
  s1:  { accent: ''#3D0C11'', glow: ''rgba(61,12,17,0.55)''   },
  s2:  { accent: ''#5A1220'', glow: ''rgba(90,18,32,0.55)''   },
  s3:  { accent: ''#6B1A2A'', glow: ''rgba(107,26,42,0.55)''  },
  s4:  { accent: ''#8B2D3F'', glow: ''rgba(139,45,63,0.55)''  },
  s5:  { accent: ''#7A5C1E'', glow: ''rgba(122,92,30,0.55)''  },
  s6:  { accent: ''#B8892A'', glow: ''rgba(184,137,42,0.55)'' },
  s7:  { accent: ''#D4A843'', glow: ''rgba(212,168,67,0.55)'' },
  s8:  { accent: ''#1A4A2E'', glow: ''rgba(26,74,46,0.55)''   },
  s9:  { accent: ''#0D2418'', glow: ''rgba(13,36,24,0.55)''   },
  s10: { accent: ''#B8892A'', glow: ''rgba(184,137,42,0.55)'' },
};
function _hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return r+'',''+g+'',''+b;
}
const NODE_X_PCT = [50, 70, 50, 30, 50, 70, 50, 30, 50, 70]; // s0..s9'
$content = $content.Replace($old1, $new1)

# ── CAMBIO 2: reemplazar bloque "Open" en openLesson() ────────────────────────
$old2 = '  // Open
  document.getElementById(''lesson-view'').classList.add(''open'');

  updateLessonProgress(sectionId);
  setupMinCharsGuard(sectionId);
}'

$new2 = '  // Open - aplicar paleta de color del viaje
  const _lc = (typeof SECCION_COLORES !== ''undefined'' && SECCION_COLORES[sectionId])
    ? SECCION_COLORES[sectionId]
    : { accent: ''#B8892A'', glow: ''rgba(184,137,42,0.55)'' };
  const _lv = document.getElementById(''lesson-view'');
  _lv.style.setProperty(''--lesson-accent'', _lc.accent);
  _lv.style.setProperty(''--lesson-glow'',   _lc.glow);
  const _pf = document.getElementById(''slide-prog-fill'');
  if (_pf) _pf.style.background = ''linear-gradient(90deg,'' + _lc.accent + '','' + _lc.accent + ''cc)'';
  setTimeout(function() {
    document.querySelectorAll(''.slide-section-badge'').forEach(function(b) {
      b.style.background  = ''rgba('' + _hexToRgb(_lc.accent) + '',0.12)'';
      b.style.borderColor = ''rgba('' + _hexToRgb(_lc.accent) + '',0.35)'';
      b.style.color       = _lc.accent;
    });
    document.querySelectorAll(''.slide-ex-eyebrow'').forEach(function(e) {
      e.style.color = _lc.accent;
    });
    document.querySelectorAll(''.slide-ex-confrontation'').forEach(function(c) {
      c.style.borderLeftColor = _lc.accent;
      c.style.background      = ''rgba('' + _hexToRgb(_lc.accent) + '',0.06)'';
    });
    document.querySelectorAll(''.slide-lesson-quote'').forEach(function(q) {
      q.style.borderLeftColor = ''rgba('' + _hexToRgb(_lc.accent) + '',0.45)'';
    });
    document.querySelectorAll(''.slide-ex-insight'').forEach(function(ins) {
      ins.style.borderColor = ''rgba('' + _hexToRgb(_lc.accent) + '',0.2)'';
      ins.style.background  = ''rgba('' + _hexToRgb(_lc.accent) + '',0.06)'';
    });
    document.querySelectorAll(''.slide-textarea'').forEach(function(ta) {
      ta.style.borderColor = ''rgba('' + _hexToRgb(_lc.accent) + '',0.2)'';
      ta.onfocus = function(){ this.style.borderColor = ''rgba('' + _hexToRgb(_lc.accent) + '',0.5)''; };
      ta.onblur  = function(){ this.style.borderColor = ''rgba('' + _hexToRgb(_lc.accent) + '',0.2)''; };
    });
    var pl = document.getElementById(''slide-prog-label'');
    if (pl) pl.style.color = ''rgba('' + _hexToRgb(_lc.accent) + '',0.55)'';
    document.querySelectorAll(''.slide-char-hint'').forEach(function(h) {
      h.style.color = ''rgba('' + _hexToRgb(_lc.accent) + '',0.4)'';
    });
  }, 0);
  _lv.classList.add(''open'');

  updateLessonProgress(sectionId);
  setupMinCharsGuard(sectionId);
}'

$content = $content.Replace($old2, $new2)
$content | Set-Content $path -Encoding UTF8
Write-Host "LISTO - colores del viaje aplicados dentro de las lecciones"
