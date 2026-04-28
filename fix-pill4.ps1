$c = Get-Content public/workbook/index.html -Raw
$viejo = "  scrollEl.addEventListener('scroll', () => {
    const containerRect = scrollEl.getBoundingClientRect();
    // Trigger point: 30% down from the top of the scroll container
    const triggerY = containerRect.top + scrollEl.clientHeight * 0.3;
    // Last block whose top is above the trigger wins
    let activeMode = 'workshop';
    for (const bloque of bloques) {
      if (bloque.el.getBoundingClientRect().top <= triggerY) {
        activeMode = bloque.mode;
      }
    }
    if (activeMode !== currentMode) {
      currentMode = activeMode;
      updateSectionPill(activeMode);
    }
  };
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });"
$nuevo = "  _semanaScrollHandler = () => {
    const containerRect = scrollEl.getBoundingClientRect();
    const triggerY = containerRect.top + scrollEl.clientHeight * 0.3;
    let activeMode = 'workshop';
    for (const bloque of bloques) {
      if (bloque.el.getBoundingClientRect().top <= triggerY) {
        activeMode = bloque.mode;
      }
    }
    if (activeMode !== currentMode) {
      currentMode = activeMode;
      updateSectionPill(activeMode);
    }
  };
  scrollEl.addEventListener('scroll', _semanaScrollHandler, { passive: true });"
$c = $c.Replace($viejo, $nuevo)
$c | Set-Content public/workbook/index.html -Encoding UTF8
Write-Host "Listo"