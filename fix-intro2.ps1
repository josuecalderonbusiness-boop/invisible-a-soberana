$path = "public\index.html"
$l = Get-Content $path -Encoding UTF8
$total = $l.Count
$top = $l[0..1193]
$bot = $l[1232..($total-1)]
$new = @'
<div id="s-intro" class="screen active">
<style>
#s-intro { position:relative; overflow:hidden; padding:0 !important; justify-content:flex-end !important; }
#s-intro .si-s1 { position:absolute; inset:0; background:linear-gradient(160deg,#3d0c11 0%,#1a0408 60%,#080101 100%); display:flex; flex-direction:column; justify-content:center; padding:52px 28px; transition:opacity .9s ease; z-index:1; }
#s-intro .si-atm { position:absolute; inset:0; pointer-events:none; background:radial-gradient(ellipse 90% 55% at 75% 0%,rgba(140,40,60,0.45),transparent 65%); }
#s-intro .si-flash { position:absolute; inset:0; background:rgba(232,201,126,0.2); opacity:0; pointer-events:none; }
#s-intro .si-clip { overflow:hidden; line-height:1.08; margin-bottom:2px; }
#s-intro .si-w { display:inline-block; font-family:'Playfair Display',serif; font-weight:700; font-size:clamp(32px,8vw,48px); color:#fff; letter-spacing:-.01em; transform:translateY(110%); opacity:0; }
#s-intro .si-gold { font-family:'Playfair Display',serif; font-weight:400; font-style:italic; font-size:clamp(32px,8vw,48px); color:#e8c97e; letter-spacing:-.01em; line-height:1.08; opacity:0; filter:brightness(4); margin-top:4px; }
#s-intro .si-s2 { position:absolute; inset:0; background:#F5F0E8; background-image:linear-gradient(rgba(0,0,0,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.06) 1px,transparent 1px); background-size:32px 32px; display:flex; flex-direction:column; justify-content:center; padding:52px 28px; opacity:0; pointer-events:none; transition:opacity .9s ease; z-index:2; }
#s-intro .si-txt { font-family:'Playfair Display',serif; font-weight:400; font-style:italic; font-size:clamp(19px,5vw,25px); color:#1a1a1a; line-height:1.65; max-width:420px; opacity:0; transform:translateY(14px); }
#s-intro .si-dot { display:inline-block; opacity:0; }
#s-intro .si-cur { display:inline-block; width:2px; height:1em; background:#1a1a1a; vertical-align:middle; margin-left:1px; opacity:0; }
@keyframes siBlink{0%,100%{opacity:1}50%{opacity:0}}
#s-intro .si-hlwrap { position:relative; display:inline; white-space:nowrap; }
#s-intro .si-hlbg { position:absolute; top:3px; left:-5px; right:-5px; bottom:0; background:#B8892A; border-radius:2px; transform:scaleX(0); transform-origin:left center; }
#s-intro .si-hltxt { position:relative; z-index:1; color:#050001; font-weight:700; font-style:normal; opacity:0; }
#s-intro .si-meta { font-family:'Inter',sans-serif; font-size:10px; letter-spacing:.18em; color:rgba(26,26,26,.35); margin-top:16px; opacity:0; }
#s-intro .si-btnw { margin-top:28px; opacity:0; transform:translateY(8px); }
#s-intro .si-btn { display:flex; align-items:center; justify-content:center; gap:10px; width:100%; padding:18px; background:linear-gradient(135deg,#6b1a2a,#8a2236); color:#F0E6CC; border-radius:12px; font-family:'Inter',sans-serif; font-size:15px; font-weight:600; cursor:pointer; border:none; box-shadow:0 6px 24px rgba(107,26,42,.4); }
#s-intro .si-note { margin-top:10px; font-size:11px; color:rgba(26,26,26,.35); font-family:'Inter',sans-serif; }
</style>

<div class="si-s1" id="siS1">
  <div class="si-atm"></div>
  <div class="si-flash" id="siFlash"></div>
  <div style="position:relative;z-index:2;max-width:420px;">
    <div class="si-clip"><span class="si-w" data-d="0">Tienes&nbsp;</span><span class="si-w" data-d="225">tu&nbsp;</span><span class="si-w" data-d="450">vida</span></div>
    <div class="si-clip"><span class="si-w" data-d="675">resuelta.</span></div>
    <div class="si-gold" id="siGold">¿Por qué tu relación<br>es lo único que no<br>puedes arreglar?</div>
  </div>
</div>

<div class="si-s2" id="siS2">
  <div style="max-width:420px;">
    <div class="si-txt" id="siTxt">
      Este escáner analiza tu frecuencia relacional y te dice exactamente qué está bloqueando la conexión<span class="si-dot" id="siD1">.</span><span class="si-dot" id="siD2">.</span><span class="si-dot" id="siD3">.</span><span class="si-cur" id="siCur"></span>&nbsp;<span class="si-hlwrap"><span class="si-hlbg" id="siHbg"></span><span class="si-hltxt" id="siHlt">con tu pareja.</span></span>
    </div>
    <div class="si-meta" id="siMeta">5 PREGUNTAS · 3 MINUTOS</div>
    <div class="si-btnw" id="siBtnW">
      <button class="si-btn" onclick="abrirPopup()">Iniciar mi escáner →</button>
      <p class="si-note">Es una herramienta de diagnóstico. No un anuncio.</p>
    </div>
  </div>
</div>

<script>
(function(){
  var GAP=225;
  var ws=document.querySelectorAll('#siS1 .si-w');

  function animS1(cb){
    ws.forEach(function(w){
      var d=parseInt(w.getAttribute('data-d')||'0');
      setTimeout(function(){
        w.style.transition='transform .72s cubic-bezier(.22,1.15,.36,1),opacity .45s ease';
        w.style.transform='translateY(0)';w.style.opacity='1';
      },d+200);
    });
    setTimeout(function(){
      var fl=document.getElementById('siFlash');
      fl.style.transition='opacity .07s ease';fl.style.opacity='1';
      setTimeout(function(){fl.style.transition='opacity .45s ease';fl.style.opacity='0';},70);
      var g=document.getElementById('siGold');
      g.style.transition='opacity .12s ease,filter .65s ease';g.style.opacity='1';
      setTimeout(function(){g.style.filter='brightness(1)';},100);
      setTimeout(cb,1200);
    },675+200+750);
  }

  function transicion(cb){
    var s1=document.getElementById('siS1');
    s1.style.opacity='0';setTimeout(function(){s1.style.pointerEvents='none';},900);
    var s2=document.getElementById('siS2');
    s2.style.opacity='1';s2.style.pointerEvents='all';
    setTimeout(cb,900);
  }

  function animS2(){
    var mt=document.getElementById('siTxt');
    mt.style.transition='opacity .7s ease,transform .7s ease';mt.style.opacity='1';mt.style.transform='none';
    setTimeout(function(){var c=document.getElementById('siCur');c.style.opacity='1';c.style.animation='siBlink .7s step-end infinite';},900);
    setTimeout(function(){document.getElementById('siD1').style.transition='opacity .15s ease';document.getElementById('siD1').style.opacity='1';},1400);
    setTimeout(function(){document.getElementById('siD2').style.transition='opacity .15s ease';document.getElementById('siD2').style.opacity='1';},1800);
    setTimeout(function(){document.getElementById('siD3').style.transition='opacity .15s ease';document.getElementById('siD3').style.opacity='1';},2200);
    setTimeout(function(){var c=document.getElementById('siCur');c.style.animation='none';c.style.opacity='0';},2600);
    setTimeout(function(){var h=document.getElementById('siHlt');h.style.transition='opacity .3s ease';h.style.opacity='1';},2800);
    setTimeout(function(){var hbg=document.getElementById('siHbg');hbg.style.transition='transform .6s cubic-bezier(.4,0,.2,1)';hbg.style.transform='scaleX(1)';},3200);
    setTimeout(function(){var m=document.getElementById('siMeta');m.style.transition='opacity .6s ease';m.style.opacity='1';},4000);
    setTimeout(function(){var b=document.getElementById('siBtnW');b.style.transition='opacity .6s ease,transform .6s ease';b.style.opacity='1';b.style.transform='none';},4400);
  }

  function run(){
    if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run);return;}
    animS1(function(){transicion(function(){animS2();});});
  }
  setTimeout(run,100);
})();
<\/script>
</div>
'@
$result = $top + $new.Split("`n") + $bot
$result | Set-Content $path -Encoding UTF8
Write-Host "LISTO"