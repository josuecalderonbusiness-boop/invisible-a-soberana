$c = Get-Content public/workbook/index.html -Raw
$viejo1 = "stars.textContent = done ? '" + [char]9733 + [char]9733 + [char]9733 + "' : '" + [char]9734 + [char]9734 + [char]9734 + "';"
$nuevo1 = "const secStars = STARS_CONFIG[sec.id] || { posibles: 3 };" + [char]10 + "      const ganadas = calcStarsForSec(sec.id);" + [char]10 + "      stars.textContent = renderStarsStr(ganadas, secStars.posibles);"
$viejo2 = "stars7d.textContent = isDone ? '" + [char]9733 + [char]9733 + [char]9733 + "' : '" + [char]9734 + [char]9734 + [char]9734 + "';"
$nuevo2 = "const d7stars = calc7dStars(nodeKey);" + [char]10 + "      stars7d.textContent = renderStarsStr(d7stars.ganadas, d7stars.posibles);"
$c = $c.Replace($viejo1, $nuevo1)
$c = $c.Replace($viejo2, $nuevo2)
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Listo"