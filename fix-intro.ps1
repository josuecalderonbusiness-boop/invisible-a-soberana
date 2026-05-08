$path = "index.html"
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content.Replace('<div id="s-intro" class="screen active">
  <div class="intro-box">
    <h1 class="intro-title-big">
      Tienes tu vida resuelta.
      <em>Â¿Por quÃ© tu relaciÃ³n es lo Ãºnico que no puedes arreglar?</em>
    </h1>
    <p class="intro-sub-small">
      Este escÃ¡ner analiza tu frecuencia relacional y te dice exactamente quÃ© estÃ¡ bloqueando la conexiÃ³n con tu pareja. 5 preguntas Â· 3 minutos
    </p>
    <button class="btn-cta" onclick="show(''s-qualify'')">
      Iniciar mi escÃ¡ner â†''
    </button>
    <p class="intro-note">Es una herramienta de diagnÃ³stico. No un anuncio.</p>
  </div>
</div>', '<div id="s-intro" class="screen active">
  <style>
  .i-line { display: block; overflow: hidden; }
  .i-word { display: inline-block; transform: translateY(110%); opacity: 0; }
  </style>
  <div class="intro-box">
    <h1 class="intro-title-big">
      <span class="i-line"><span class="i-word" data-d="80">Tienes tu vida resuelta.</span></span>
      <em><span class="i-line"><span class="i-word" data-d="320">&#xBF;Por qu&#xE9; tu relaci&#xF3;n es lo &#xFA;nico que no puedes arreglar?</span></span></em>
    </h1>
    <p class="intro-sub-small" id="iSub" style="opacity:0;transform:translateY(12px);transition:opacity .6s ease,transform .6s ease;">
      Este esc&#xE1;ner analiza tu frecuencia relacional y te dice exactamente qu&#xE9; est&#xE1; bloqueando la conexi&#xF3;n con tu pareja. 5 preguntas &middot; 3 minutos
    </p>
    <div id="iBtnWrap" style="opacity:0;transform:translateY(10px);transition:opacity .5s ease,transform .5s ease;">
      <button class="btn-cta" onclick="show(''s-qualify'')">
        Iniciar mi esc&#xE1;ner &rarr;
      </button>
      <p class="intro-note">Es una herramienta de diagn&#xF3;stico. No un anuncio.</p>
    </div>
  </div>
  <script>
  (function(){
    var words = document.querySelectorAll("#s-intro .i-word");
    words.forEach(function(w){
      var d = parseInt(w.getAttribute("data-d")||"0");
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
    }, 900);
  })();
  <\/script>
</div>')
$content | Set-Content $path -Encoding UTF8
Write-Host "LISTO"