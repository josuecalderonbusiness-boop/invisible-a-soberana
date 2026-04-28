function flyStarTo(fromEl, starIdx) {
  var from = fromEl.getBoundingClientRect();
  var toEl = document.getElementById('st'+starIdx);
  if (!toEl) return;
  var to = toEl.getBoundingClientRect();
  var star = document.createElement('span');
  star.textContent = '★';
  star.style.cssText = 'position:fixed;z-index:99999;font-size:22px;color:#D4A843;pointer-events:none;left:'+(from.left+from.width/2-11)+'px;top:'+(from.top+from.height/2-11)+'px;';
  document.body.appendChild(star);
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){
      star.style.transition = 'all 0.5s cubic-bezier(.4,0,.2,1)';
      star.style.left = (to.left+to.width/2-11)+'px';
      star.style.top = (to.top+to.height/2-11)+'px';
      star.style.transform = 'scale(1.4)';
      setTimeout(function(){
        toEl.classList.add('active');
        var lbl=document.getElementById('star-lbl');
        if(lbl) lbl.textContent=starIdx+' / 5';
        star.remove();
      }, 500);
    });
  });
}
function pick(i) {
  document.querySelectorAll('.opt').forEach(o=>o.classList.remove('on'));
  var clickedOpt = document.querySelectorAll('.opt')[i];
  clickedOpt.classList.add('on');
  ans[curQ] = i;
  flyStarTo(clickedOpt, curQ+1);
  sc = {S:0,P:0,D:0};
  ans.forEach((a, qi) => {
    if (a !== undefined && QS[qi]) {
      Object.entries(QS[qi].opts[a].v).forEach(([k,v]) => sc[k] += v);
    }
  });
  setTimeout(() => showBridge(curQ, i), 480);
}