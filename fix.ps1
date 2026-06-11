$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content -replace "leccion1_tema_1b\.png", "leccion1_tema_1.webp"
$content = $content -replace "leccion1_tema_2b\.png", "leccion1_tema_2.webp"
$content = $content -replace "leccion1_tema_3b\.png", "leccion1_tema_3.webp"
$content = $content -replace "leccion1_tema_4b\.png", "leccion1_tema_4.webp"
$content = $content -replace "leccion(\d+)_tema_(\d+)\.png", "leccion`$1_tema_`$2.webp"
$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."