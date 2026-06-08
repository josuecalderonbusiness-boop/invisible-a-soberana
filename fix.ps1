$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$old = '            <div class="pod-reveal-btn-text">\u00bfCu\u00e1les son las<br>4 dimensiones?</div>'
$new = '            <div class="pod-reveal-btn-text">\u00bfCu\u00e1les son las<br>4 dimensiones?</div>'
$content = $content.Replace($old, $new)

$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."