$c = Get-Content public/workbook/sw.js -Raw
$c = $c -replace "const CACHE_NAME = 'soberana-v\d+'", ("const CACHE_NAME = 'soberana-v" + [int]([regex]::Match($c, "soberana-v(\d+)").Groups[1].Value) + 1 + "'")
$c | Set-Content public/workbook/sw.js -Encoding UTF8
Write-Host "SW version actualizada"