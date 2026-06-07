$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$content = $content.Replace(
    'function sitResponder(secId, idx, btn, correcto, hintId, fbkId) {',
    'function sitToggleEx(secId, idx) {
  const box = document.getElementById(''sitexbox_'' + secId + ''_'' + idx);
  const arrow = document.getElementById(''sitexarrow_'' + secId + ''_'' + idx);
  const triggerBtn = document.getElementById(''sitexbtn_'' + secId + ''_'' + idx);
  if (!box) return;
  const isOpen = box.style.display !== ''none'';
  if (isOpen) {
    box.style.display = ''none'';
    if (arrow) arrow.style.transform = ''rotate(0deg)'';
  } else {
    box.style.display = ''block'';
    if (arrow) arrow.style.transform = ''rotate(180deg)'';
    // Auto-scroll para que el ejercicio quede visible
    setTimeout(function() {
      const panel = box.closest(''.slide-panel'') || document.getElementById(''slide-panel-'' + window._slideIndex);
      if (panel) {
        const btnTop = triggerBtn ? triggerBtn.getBoundingClientRect().top : 0;
        const panelTop = panel.getBoundingClientRect().top;
        const scrollTo = panel.scrollTop + (btnTop - panelTop) - 12;
        panel.scrollTo({ top: scrollTo, behavior: ''smooth'' });
      }
    }, 50);
  }
}

function sitResponder(secId, idx, btn, correcto, hintId, fbkId) {'
)

$content | Set-Content $path -Encoding UTF8
Write-Host "Fix2 aplicado."