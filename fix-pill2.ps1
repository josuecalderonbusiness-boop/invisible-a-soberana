$c = Get-Content public/workbook/index.html -Raw
$viejo = "  _semanaScrollHandler = arguments.callee;
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });"
$nuevo = "  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });"
$c = $c.Replace($viejo, $nuevo)

$viejo2 = "    if (activeMode !== currentMode) {
      currentMode = activeMode;
      updateSectionPill(activeMode);
    }
  };
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });
}"
$nuevo2 = "    if (activeMode !== currentMode) {
      currentMode = activeMode;
      updateSectionPill(activeMode);
    }
  };
  _semanaScrollHandler = handler;
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });
}"
$c = $c.Replace($viejo2, $nuevo2)

$viejo3 = "  scrollEl.addEventListener('scroll', () => {"
$nuevo3 = "  const handler = () => {"
$c = $c.Replace($viejo3, $nuevo3)

$viejo4 = "    }
  }, { passive: true });
}

// ═══════════════════════════════════════════
// PROGRESS UI"
$nuevo4 = "    }
  };
  _semanaScrollHandler = handler;
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });
}

// ═══════════════════════════════════════════
// PROGRESS UI"
$c = $c.Replace($viejo4, $nuevo4)
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Listo"