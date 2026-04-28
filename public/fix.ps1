$path = "public\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$content = $content -replace 'function submitWa\(\) \{
  const waNum = document\.getElementById\(''g-wa''\)\.value\.trim\(\);
  const wa = waNum \? selectedCountryCode \+ waNum\.replace\(/\^0\+/, ''\) : '''';
  const top = Object\.entries\(sc\)\.sort\(\(a,b\)=>b\[1\]-a\[1\]\)\[0\]\[0\];', 'function submitWa() {
  const waNum = document.getElementById(''g-wa'').value.trim();
  if (!waNum) {
    const inp = document.getElementById(''g-wa'');
    inp.style.borderColor = ''rgba(184,137,42,.8)'';
    inp.style.boxShadow = ''0 0 0 2px rgba(184,137,42,.2)'';
    inp.placeholder = ''Ingresa tu número para continuar'';
    inp.focus();
    return;
  }
  const wa = waNum ? selectedCountryCode + waNum.replace(/^0+/, '''') : '''';
  const top = Object.entries(sc).sort((a,b)=>b[1]-a[1])[0][0];'

$content | Set-Content $path -Encoding UTF8