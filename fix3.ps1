$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$content = $content.Replace(
    '    if (curSlide && curSlide.type === ''exercise'' && curSlide.ex && curSlide.ex.label && curSlide.ex.label.includes(''Pausa Workbook'')) {
      btn.style.display = ''none'';
    }
  }',
    '    if (curSlide && curSlide.type === ''exercise'' && curSlide.ex && curSlide.ex.label && curSlide.ex.label.includes(''Pausa Workbook'')) {
      btn.style.display = ''none'';
    }
    if (curSlide && curSlide.type === ''situaciones'') {
      btn.style.display = ''none'';
    }
  }'
)

$content | Set-Content $path -Encoding UTF8
Write-Host "Fix3 aplicado."