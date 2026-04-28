@
$path = "index.html"
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content -replace "clamp\(15px, 3\.5vw, 18px\); font-style: italic;", "16px; font-style: normal;"
$content | Set-Content $path -Encoding UTF8
@
