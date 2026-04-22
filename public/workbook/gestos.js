// ══════════════════════════════════════════
// SOBERANA — GESTOS Y TRANSICIONES LIQUIDAS
// ══════════════════════════════════════════

const TAB_ORDER = ['inicio', 'novedades', 'entrenamiento', 'progreso'];
let _currentTab = 'inicio';

const _switchTabOriginal = window.switchTab;

window.switchTabLiquido = function(tab, direction) {
  const tabs = TAB_ORDER;
  const oldIdx = tabs.indexOf(_currentTab);
  const newIdx = tabs.indexOf(tab);
  if (tab === _currentTab) return;

  const dir = direction || (newIdx > oldIdx ? 'right' : 'left');
  const oldEl = document.getElementById('tab-' + _currentTab);
  const newEl = document.getElementById('tab-' + tab);

  if (newEl && oldEl) {
    newEl.classList.remove('tab-enter-right','tab-enter-left');
    newEl.classList.add(dir === 'right' ? 'tab-enter-right' : 'tab-enter-left');
    newEl.classList.add('active');
    newEl.getBoundingClientRect();
    newEl.classList.remove('tab-enter-right','tab-enter-left');
    oldEl.classList.add(dir === 'right' ? 'tab-exit-left' : 'tab-exit-right');
    setTimeout(function() {
      oldEl.classList.remove('active','tab-exit-left','tab-exit-right');
    }, 390);
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    var newBtn = document.getElementById('tab-btn-' + tab);
    if (newBtn) newBtn.classList.add('active');
    _currentTab = tab;
    if (navigator.vibrate) navigator.vibrate(10);
  }

  window.switchTab(tab);
};

// SWIPE ENTRE TABS
(function() {
  var tsX = 0, tsY = 0;
  document.addEventListener('touchstart', function(e) {
    tsX = e.touches[0].clientX;
    tsY = e.touches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function(e) {
    var dx = e.changedTouches[0].clientX - tsX;
    var dy = e.changedTouches[0].clientY - tsY;
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (tsX < 15 || tsX > window.innerWidth - 15) return;
    var tabs = TAB_ORDER;
    var idx = tabs.indexOf(_currentTab);
    if (dx < 0 && idx < tabs.length - 1) window.switchTabLiquido(tabs[idx + 1], 'right');
    else if (dx > 0 && idx > 0) window.switchTabLiquido(tabs[idx - 1], 'left');
  }, { passive: true });
}());

// SWIPE DOWN PARA CERRAR DRAWERS
(function() {
  var sY = 0, sX = 0, activeSheet = null;
  document.addEventListener('touchstart', function(e) {
    var sheet = e.target.closest('.modal-sheet');
    if (!sheet) return;
    sY = e.touches[0].clientY;
    sX = e.touches[0].clientX;
    activeSheet = sheet;
  }, { passive: true });
  document.addEventListener('touchmove', function(e) {
    if (!activeSheet) return;
    var dy = e.touches[0].clientY - sY;
    var dx = e.touches[0].clientX - sX;
    if (dy <= 0 || Math.abs(dx) > Math.abs(dy)) return;
    activeSheet.classList.add('dragging');
    activeSheet.style.transform = 'translateY(' + dy + 'px)';
    var overlay = activeSheet.closest('.modal-overlay');
    if (overlay) overlay.style.opacity = Math.max(0, 1 - dy / 350);
  }, { passive: true });
  document.addEventListener('touchend', function(e) {
    if (!activeSheet) return;
    var dy = e.changedTouches[0].clientY - sY;
    activeSheet.classList.remove('dragging');
    if (dy > 100) {
      activeSheet.style.transform = 'translateY(100%)';
      var overlay = activeSheet.closest('.modal-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(function() { overlay.style.display = 'none'; overlay.style.opacity = ''; }, 420);
      }
      setTimeout(function() { activeSheet.style.transform = ''; }, 420);
      if (navigator.vibrate) navigator.vibrate(15);
    } else {
      activeSheet.style.transition = 'transform 300ms cubic-bezier(0.34,1.56,0.64,1)';
      activeSheet.style.transform = 'translateY(0)';
      setTimeout(function() { activeSheet.style.transition = ''; }, 310);
      var overlay = activeSheet.closest('.modal-overlay');
      if (overlay) overlay.style.opacity = '';
    }
    activeSheet = null;
  }, { passive: true });
}());