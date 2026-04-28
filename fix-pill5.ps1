$c = Get-Content public/workbook/index.html -Raw
$viejo = "  };
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });
}"
$nuevo = "  }
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });
}"
$c = $c.Replace($viejo, $nuevo)
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Listo"