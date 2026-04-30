$path = "index.html"
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content -replace 'position:absolute;inset:0;width:100%;height:100%;border:none;object-fit:cover;', 'position:absolute;top:0;left:0;width:100%;height:100%;border:none;'
$content | Set-Content $path -Encoding UTF8