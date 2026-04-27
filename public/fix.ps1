$path = "cards.css"
$content = Get-Content $path -Raw
$content = $content -replace 'font-size:22px', 'font-size:17px'
$content = $content -replace 'padding:26px 22px', 'padding:18px 16px'
$content | Set-Content $path -Encoding UTF8