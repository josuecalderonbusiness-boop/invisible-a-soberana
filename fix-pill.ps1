$c = Get-Content public/workbook/index.html -Raw
$viejo = "function setupSemanaObservers() {
  const scrollEl = document.getElementById('app-main');
  if (!scrollEl) return;"
$nuevo = "let _semanaScrollHandler = null;
function setupSemanaObservers() {
  const scrollEl = document.getElementById('app-main');
  if (!scrollEl) return;
  if (_semanaScrollHandler) {
    scrollEl.removeEventListener('scroll', _semanaScrollHandler);
    _semanaScrollHandler = null;
  }"
$c = $c.Replace($viejo, $nuevo)
$viejo2 = "    if (activeMode !== currentMode) {
      currentMode = activeMode;
      updateSectionPill(activeMode);
    }
  }, { passive: true });
}"
$nuevo2 = "    if (activeMode !== currentMode) {
      currentMode = activeMode;
      updateSectionPill(activeMode);
    }
  };
  _semanaScrollHandler = arguments.callee;
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });
}"
$c = $c.Replace($viejo2, $nuevo2)
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Listo"