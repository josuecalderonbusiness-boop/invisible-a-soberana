$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content -replace "if \(btn\) btn\.style\.display = 'none';\r\n\}", "if (btn) btn.style.display = 'none';`r`n  const sf = document.querySelector('.slide-footer');`r`n  if (sf) sf.style.display = 'none';`r`n}"
$content | Set-Content $path -Encoding UTF8