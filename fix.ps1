$path = "public\index.html"
$svg = Get-Content "public\boveda_corona_v1.svg" -Raw -Encoding UTF8
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content -replace '(<div id="boveda-svg"[^>]*>)\s*</div>', "`$1`n$svg`n    </div>"
$content | Set-Content $path -Encoding UTF8
