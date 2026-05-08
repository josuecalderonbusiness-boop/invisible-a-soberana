$path = "public\index.html"
$l = Get-Content $path -Encoding UTF8
$total = $l.Count
$top = $l[0..1193]
$bot = $l[1218..($total-1)]
$new = @'
<div id="s-intro" class="screen active">
<style>
#s-intro{position:relative;overflow:hidden;padding:0!important;}
#s-intro .si-s1{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;padding:52px 28px;transition:opacity .9s ease;z-index:1;}
#s-intro .si-s2{position:absolute;inset:0;background:#F5F0E8;background-image:linear-gradient(rgba(0,0,0,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.06) 1px,transparent 1px);background-size:32px 32px;display:flex;flex-direction:column;justify-content:center;padding:52px 28px;opacity:0;pointer-events:none;transition:opacity .9s ease;z-index:2;}
#s-intro .si-flash{position:absolute;inset:0;background:rgba(232,201,126,0.2);opacity:0;pointer-events:none;}
#s-intro .si-clip{overflow:hidden;line-height:1.08;margin-bottom:2px;}
#s-intro .si-w{display:inline-block;font-weight:700;font-size:clamp(32px,8vw,48px);color:#fff;letter-spacing:-.01em;transform:translateY(110%);opacity:0;}
#s-intro .si-gold{font-style:italic;font-weight:400;font-size:clamp(32px,8vw,48px);color:#e8c97e;letter-spacing:-.01em;line-height:1.08;opacity:0;filter:brightness(4);margin-top:4px;}
#s-intro .si-txt{font-style:italic;font-weight:400;font-size:clamp(19px,5vw,25px);color:#1a1a1a;line-height:1.65;max-width:420px;opacity:0;transform:translateY(14px);}
#s-intro .si-dot{display:inline-block;opacity:0;}
#s-intro .si-cur{display:inline-block;width:2px;height:1em;background:#1a1a1a;vertical-align:middle;margin-left:1px;opacity:0;}
@keyframes siBlink{0%,100%{opacity:1}50%{opacity:0}}
#s-intro .si-hlwrap{position:relative;display:inline;white-space:nowrap;}
#s-intro .si-hlbg{position:absolute;top:3px;left:-5px;right:-5px;bottom:0;background:#B8892A;border-radius:2px;transform:scaleX(0);transform-origin:left center;}
#s-intro .si-hltxt{position:relative;z-index:1;color:#050001;font-weight:700;font-style:normal;opacity:0;}
#s-intro .si-meta{font-size:10px;letter-spacing:.18em;color:rgba(26,26,26,.35);margin-top:16px;opacity:0;}
#s-intro .si-btnw{margin-top:28px;opacity:0;transform:translateY(8px);}
#s-intro .si-btn{display:flex;align-items:center;justify-content:center;width:100%;padding:18px;background:linear-gradient(135deg,#6b1a2a,#8a2236);color:#F0E6CC;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;border:none;box-shadow:0 6px 24px rgba(107,26,42,.4);}
#s-intro .si-note{margin-top:10px;font-size:11px;color:rgba(26,26,26,.35);}
</style>
<div class="si-s1" id="siS1">
  <div class="si-flash" id="siFlash"></div>
  <div style="position:relative;z-index:2;max-width:420px;">
    <div class="si-clip"><span class="si-w" data-d="0">Tienes&nbsp;</span><span class="si-w" data-d="225">tu&nbsp;</span><span class="si-w" data-d="450">vida</span></div>
    <div class="si-clip"><span class="si-w" data-d="675">resuelta.</span></div>
    <div class="si-gold" id="siGold">&#xBF;Por qu&#xE9; tu relaci&#xF3;n<br>es lo &#xFA;nico que no<br>puedes arreglar?</div>
  </div>
</div>
<div class="si-s2" id="siS2">
  <div style="max-width:420px;">
    <div class="si-txt" id="siTxt">Este esc&#xE1;ner analiza tu frecuencia relacional y te dice exactamente qu&#xE9; est&#xE1; bloqueando la conexi&#xF3;n<span class="si-dot" id="siD1">.</span><span class="si-dot" id="siD2">.</span><span class="si-dot" id="siD3">.</span><span class="si-cur" id="siCur"></span>&nbsp;<span class="si-hlwrap"><span class="si-hlbg" id="siHbg"></span><span class="si-hltxt" id="siHlt">con tu pareja.</span></span></div>
    <div class="si-meta" id="siMeta">5 PREGUNTAS &middot; 3 MINUTOS</div>
    <div class="si-btnw" id="siBtnW"><button class="si-btn" onclick="abrirPopup()">Iniciar mi esc&#xE1;ner &rarr;</button><p class="si-note">Es una herramienta de diagn&#xF3;stico. No un anuncio.</p></div>
  </div>
</div>
<script src="/intro-anim.js"></script>
</div>
'@
$lines = $new -split "`n"
$result = $top + $lines + $bot
$result | Set-Content $path -Encoding UTF8
Write-Host "LISTO"