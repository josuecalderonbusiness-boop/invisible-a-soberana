$l = Get-Content "index.html" -Encoding UTF8
$total = $l.Count
$top = $l[0..1145]
$bot = $l[1185..($total-1)]
$new = @'
<div id="s-intro" class="screen active">
<style>
.i-line{display:block;overflow:hidden;line-height:1.08;}
.i-word{display:inline-block;transform:translateY(110%);opacity:0;}
</style>
<div class="intro-box">
<h1 class="intro-title-big">
<span class="i-line">
<span class="i-word" data-d="80">Tienes</span>&nbsp;<span class="i-word" data-d="200">tu</span>&nbsp;<span class="i-word" data-d="320">vida</span>&nbsp;<span class="i-word" data-d="440">resuelta.</span>
</span>
<em><span class="i-line">
<span class="i-word" data-d="600">Por</span>&nbsp;<span class="i-word" data-d="700">que</span>&nbsp;<span class="i-word" data-d="800">tu</span>&nbsp;<span class="i-word" data-d="900">relacion</span>&nbsp;<span class="i-word" data-d="1000">no</span>&nbsp;<span class="i-word" data-d="1100">puede</span>&nbsp;<span class="i-word" data-d="1200">serlo?</span>
</span></em>
</h1>
<p class="intro-sub-small" id="iSub" style="opacity:0;transform:translateY(12px);transition:opacity .6s ease,transform .6s ease;">
Este escaner analiza tu frecuencia relacional y te dice exactamente que esta bloqueando la conexion con tu pareja. 5 preguntas · 3 minutos
</p>
<div id="iBtnWrap" style="opacity:0;transform:translateY(10px);transition:opacity .5s ease,transform .5s ease;">
<button class="btn-cta" onclick="show('s-qualify')">Iniciar mi escaner</button>
<p class="intro-note">Es una herramienta de diagnostico. No un anuncio.</p>
</div>
</div>
<script>
(function(){
  function run(){
    var words = document.querySelectorAll("#s-intro .i-word");
    words.forEach(function(w){
      var d = parseInt(w.getAttribute("data-d") || "0");
      setTimeout(function(){
        w.style.transition = "transform .6s cubic-bezier(.22,1.4,.36,1), opacity .4s ease";
        w.style.transform = "translateY(0)";
        w.style.opacity = "1";
      }, d);
    });
    setTimeout(function(){
      var s = document.getElementById("iSub");
      var b = document.getElementById("iBtnWrap");
      if(s){ s.style.opacity="1"; s.style.transform="none"; }
      if(b){ b.style.opacity="1"; b.style.transform="none"; }
    }, 1500);
  }
  if(document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", run);
  } else {
    setTimeout(run, 100);
  }
})();
</script>
</div>
'@
$result = $top + $new.Split("`n") + $bot
$result | Set-Content "index.html" -Encoding UTF8
Write-Host "LISTO"