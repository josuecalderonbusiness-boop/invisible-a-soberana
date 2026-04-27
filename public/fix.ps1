$path = "index.html"
$lines = Get-Content $path
$lines[2855] = '    var cards = [''ri1'',''ri2'',''ri3''];'
$lines[2856] = '    var ci = 0;'
$lines[2857] = '    function mostrarCard(idx) {'
$lines[2858] = '      if (idx >= cards.length) { if (btn) { btn.style.display = ''block''; } return; }'
$lines[2859] = '      var el = document.getElementById(cards[idx]);'
$lines[2860] = '      if (!el) return;'
$lines[2861] = '      el.style.display = ''block''; el.style.opacity = ''1''; el.style.transform = ''scale(1)''; el.style.filter = ''blur(0)''; el.style.transition = ''opacity .6s ease, transform .6s cubic-bezier(.2,0,.15,1), filter .6s ease'';'
$lines[2862] = '      var glow = el.querySelector(''.card-glow''); if (glow) { glow.style.transition = ''opacity 1s ease''; glow.style.opacity = ''1''; }'
$lines[2863] = '      if (idx < cards.length - 1) {'
$lines[2864] = '        setTimeout(function() { el.style.opacity = ''0''; el.style.transform = ''scale(0.9) translateY(-10px)''; setTimeout(function() { el.style.display = ''none''; mostrarCard(idx + 1); }, 500); }, 2500);'
$lines[2865] = '      } else { setTimeout(function() { if (btn) btn.style.display = ''block''; }, 2000); }'
$lines[2866] = '    }'
$lines[2867] = '    cards.forEach(function(id) { var el = document.getElementById(id); if(el) el.style.display = ''none''; });'
$lines[2868] = '    setTimeout(function() { mostrarCard(0); }, 200);'
$lines | Set-Content $path -Encoding UTF8