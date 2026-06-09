$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

# Cambio 1: quitar autoplay=true del iframe para que no arranque solo
$content = $content.Replace(
  'src="https://iframe.mediadelivery.net/embed/${libId}/${tema.bunnyVideoId}?autoplay=true&loop=false&muted=false&preload=true&responsive=true"',
  'src="https://iframe.mediadelivery.net/embed/${libId}/${tema.bunnyVideoId}?autoplay=false&loop=false&muted=false&preload=true&responsive=true"'
)

# Cambio 2: agregar autoplay al llegar al slide en podIrAT2
$old = 'function podIrAT2() {
  const idx = _slides.findIndex(s => s.type === ''tema-video'' && s.tema && s.tema.num === 2);
  if (idx !== -1) {
    _slideIndex = idx;
    const track = document.getElementById(''slide-track'');
    if (track) {
      track.style.transition = ''transform 0.4s ease'';
      track.style.transform = ''translateX(-'' + (idx * 100) + ''%)'';
    }
    _updateSlideUI();
  }
}'

$new = 'function podIrAT2() {
  const idx = _slides.findIndex(s => s.type === ''tema-video'' && s.tema && s.tema.num === 2);
  if (idx !== -1) {
    _slideIndex = idx;
    const track = document.getElementById(''slide-track'');
    if (track) {
      track.style.transition = ''transform 0.4s ease'';
      track.style.transform = ''translateX(-'' + (idx * 100) + ''%)'';
    }
    _updateSlideUI();
    setTimeout(function() {
      const iframe = document.getElementById(''vertical-iframe-2'');
      if (iframe) {
        iframe.src = iframe.src.replace(''autoplay=false'', ''autoplay=true'');
      }
    }, 600);
  }
}'

$content = $content.Replace($old, $new)
$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."