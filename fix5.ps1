$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$content = $content.Replace(
    '    // Ocultar bot' + [char]0xF3 + 'n continuar en slide de Pausa Workbook
    const curSlide = _slides[current];
    if (curSlide && curSlide.type === ''exercise'' && curSlide.ex && curSlide.ex.label && curSlide.ex.label.includes(''Pausa Workbook'')) {
      btn.style.display = ''none'';
    }
  }',
    '    // Ocultar bot' + [char]0xF3 + 'n continuar en slide de Pausa Workbook y situaciones
    const curSlide = _slides[current];
    if (curSlide && curSlide.type === ''exercise'' && curSlide.ex && curSlide.ex.label && curSlide.ex.label.includes(''Pausa Workbook'')) {
      btn.style.display = ''none'';
    }
    if (curSlide && curSlide.type === ''situaciones'') {
      btn.style.display = ''none'';
    }
  }'
)

$content | Set-Content $path -Encoding UTF8
Write-Host "Fix5 aplicado."