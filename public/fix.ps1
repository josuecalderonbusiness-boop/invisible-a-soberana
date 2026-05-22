$path = "public\workbook\index.html"
$lines = Get-Content $path -Encoding UTF8

# Eliminar líneas 4375 a 4388 (hilo-banner + daily-quote, índice base 0 = línea -1)
$newLines = $lines[0..4373] + $lines[4387..$($lines.Length - 1)]

$newLines | Set-Content $path -Encoding UTF8
Write-Host "Listo"