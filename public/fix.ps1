$path = "index.html"
$content = Get-Content $path -Raw
$content = $content -replace "if \(el\) \{ el\.style\.opacity = '1'; el\.style\.transform = 'translateY\(0\)'; \}", "if (el) { el.style.transition = 'opacity 0.9s ease, transform 1s cubic-bezier(.2,0,.15,1), filter 0.9s ease'; el.style.opacity = '1'; el.style.transform = 'scale(1)'; el.style.filter = 'blur(0)'; var glow = el.querySelector('.card-glow'); if(glow){ glow.style.transition = 'opacity 1.2s ease'; glow.style.opacity = '1'; } }"
$content | Set-Content $path -Encoding UTF8