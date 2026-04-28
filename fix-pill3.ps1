$c = Get-Content public/workbook/index.html -Raw
$c = $c.Replace("  _semanaScrollHandler = arguments.callee;`r`n  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });", "  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });")
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Listo"