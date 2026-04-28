$content = Get-Content "public\index.html" -Raw -Encoding UTF8
$bridge = Get-Content "bridge.js" -Raw -Encoding UTF8
$content = $content -replace "function nextQ\(\) \{", ($bridge + "`nfunction nextQ() {")
$content | Set-Content "public\index.html" -Encoding UTF8
Write-Host "LISTO"
