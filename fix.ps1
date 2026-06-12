$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

# FIX 1: Particulas — pod-skin-new necesita height:100% para que el canvas tenga dimensiones
$content = $content.Replace(
  '.pod-skin-new{width:100%;min-height:100%;',
  '.pod-skin-new{width:100%;height:100%;min-height:640px;'
)

# FIX 2: Waveform — inicializar canvas antes del primer timeupdate
$content = $content.Replace(
  '  if (audio) {' + "`r`n" + '      audio.addEventListener(''timeupdate'', function() {' + "`r`n" + '        if (!audio.duration) return;' + "`r`n" + '        const pct = (audio.currentTime / audio.duration) * 100;',
  '  podDrawWave(temaNum, 0);' + "`r`n" + '  if (audio) {' + "`r`n" + '      audio.addEventListener(''timeupdate'', function() {' + "`r`n" + '        if (!audio.duration) return;' + "`r`n" + '        const pct = (audio.currentTime / audio.duration) * 100;'
)

$content | Set-Content $path -Encoding UTF8
Write-Host "Listo"