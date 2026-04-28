$path = "public\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$old = '      <div class="res-item" id="ri1" style="position:relative;z-index:1;display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:linear-gradient(135deg,rgba(70,40,50,.7),rgba(40,20,30,.8));border:1px solid rgba(184,137,42,.35);border-radius:14px;margin-bottom:12px;opacity:0;transform:translateY(20px) scale(0.97);transition:all .5s ease;box-shadow:0 0 24px rgba(184,137,42,.08);">
        <span style="color:#D4A843;font-size:22px;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(184,137,42,0.5));">✦</span>
        <span style="font-family:''Jost'',sans-serif;font-size:15px;color:rgba(240,230,234,.92);line-height:1.55;text-align:left;">Por que te sientes asi con el, aunque lo amas</span>
      </div>
      <div class="res-item" id="ri2" style="position:relative;z-index:1;display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:linear-gradient(135deg,rgba(70,40,50,.7),rgba(40,20,30,.8));border:1px solid rgba(184,137,42,.35);border-radius:14px;margin-bottom:12px;opacity:0;transform:translateY(20px) scale(0.97);transition:all .5s ease;box-shadow:0 0 24px rgba(184,137,42,.08);">
        <span style="color:#D4A843;font-size:22px;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(184,137,42,0.5));">✦</span>
        <span style="font-family:''Jost'',sans-serif;font-size:15px;color:rgba(240,230,234,.92);line-height:1.55;text-align:left;">Que es lo que esta bloqueando la conexion entre los dos</span>
      </div>
      <div class="res-item" id="ri3" style="position:relative;z-index:1;display:flex;align-items:flex-start;gap:12px;padding:16px 18px;background:linear-gradient(135deg,rgba(70,40,50,.7),rgba(40,20,30,.8));border:1px solid rgba(184,137,42,.35);border-radius:14px;margin-bottom:12px;opacity:0;transform:translateY(20px) scale(0.97);transition:all .5s ease;box-shadow:0 0 24px rgba(184,137,42,.08);">
        <span style="color:#D4A843;font-size:22px;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(184,137,42,0.5));">✦</span>
        <span style="font-family:''Jost'',sans-serif;font-size:15px;color:rgba(240,230,234,.92);line-height:1.55;text-align:left;">Que hacer esta semana para que algo cambie</span>
      </div>'

$new = '      <div id="ri1" style="opacity:0;transform:translateY(20px) scale(0.97);transition:all .5s ease;margin-bottom:14px;">
<svg viewBox="0 0 380 100" width="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F5E6C8"/><stop offset="30%" stop-color="#FFD97A"/><stop offset="55%" stop-color="#FFF8E7"/><stop offset="80%" stop-color="#D4A843"/><stop offset="100%" stop-color="#B8892A"/></linearGradient>
    <linearGradient id="shine1" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="50%" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <filter id="glow1"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect x="2" y="2" width="376" height="96" rx="12" fill="url(#gold1)" filter="url(#glow1)"/>
  <rect x="2" y="2" width="376" height="48" rx="12" fill="url(#shine1)"/>
  <rect x="2" y="2" width="376" height="96" rx="12" fill="none" stroke="#F0D880" stroke-width="1.2"/>
  <rect x="8" y="8" width="364" height="84" rx="9" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
  <text x="50" y="42" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">Por que te sientes</text>
  <text x="50" y="62" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">asi con el, aunque</text>
  <text x="50" y="82" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">lo amas</text>
  <text x="18" y="62" font-family="serif" font-size="26" fill="#8B5E10">✦</text>
</svg>
      </div>
      <div id="ri2" style="opacity:0;transform:translateY(20px) scale(0.97);transition:all .5s ease;margin-bottom:14px;">
<svg viewBox="0 0 380 100" width="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold2" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F5E6C8"/><stop offset="30%" stop-color="#FFD97A"/><stop offset="55%" stop-color="#FFF8E7"/><stop offset="80%" stop-color="#D4A843"/><stop offset="100%" stop-color="#B8892A"/></linearGradient>
    <linearGradient id="shine2" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="50%" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <filter id="glow2"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect x="2" y="2" width="376" height="96" rx="12" fill="url(#gold2)" filter="url(#glow2)"/>
  <rect x="2" y="2" width="376" height="48" rx="12" fill="url(#shine2)"/>
  <rect x="2" y="2" width="376" height="96" rx="12" fill="none" stroke="#F0D880" stroke-width="1.2"/>
  <rect x="8" y="8" width="364" height="84" rx="9" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
  <text x="50" y="42" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">Que es lo que esta</text>
  <text x="50" y="62" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">bloqueando la conexion</text>
  <text x="50" y="82" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">entre los dos</text>
  <text x="18" y="62" font-family="serif" font-size="26" fill="#8B5E10">✦</text>
</svg>
      </div>
      <div id="ri3" style="opacity:0;transform:translateY(20px) scale(0.97);transition:all .5s ease;margin-bottom:14px;">
<svg viewBox="0 0 380 100" width="100%" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gold3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F5E6C8"/><stop offset="30%" stop-color="#FFD97A"/><stop offset="55%" stop-color="#FFF8E7"/><stop offset="80%" stop-color="#D4A843"/><stop offset="100%" stop-color="#B8892A"/></linearGradient>
    <linearGradient id="shine3" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.6"/><stop offset="50%" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
    <filter id="glow3"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect x="2" y="2" width="376" height="96" rx="12" fill="url(#gold3)" filter="url(#glow3)"/>
  <rect x="2" y="2" width="376" height="48" rx="12" fill="url(#shine3)"/>
  <rect x="2" y="2" width="376" height="96" rx="12" fill="none" stroke="#F0D880" stroke-width="1.2"/>
  <rect x="8" y="8" width="364" height="84" rx="9" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="0.5"/>
  <text x="50" y="52" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">Que hacer esta semana</text>
  <text x="50" y="72" font-family="Playfair Display,serif" font-size="13" font-weight="700" fill="#3D1A00">para que algo cambie</text>
  <text x="18" y="65" font-family="serif" font-size="26" fill="#8B5E10">✦</text>
</svg>
      </div>'

$content = $content.Replace($old, $new)
$content | Set-Content $path -Encoding UTF8 -NoNewline