$path = "public\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

# Cambiar estilo del eyebrow a mas grande y personal
$content = $content -replace 'font-size:10px;color:#B8892A;letter-spacing:2\.5px;text-transform:uppercase;margin-bottom:6px;" id="precio-eyebrow">ACCESO GENERADO</p>', 'font-size:22px;color:#E8C97E;letter-spacing:0;text-transform:none;margin-bottom:4px;font-family:''Cormorant Garamond'',serif;font-style:italic;font-weight:700;line-height:1.2;" id="precio-eyebrow">Aqui tienes tu acceso</p>'

# Actualizar el JS para usar el nuevo formato
$content = $content -replace "document\.getElementById\('precio-eyebrow'\)\.textContent = 'ACCESO GENERADO PARA ' \+ uName\.toUpperCase\(\);", "document.getElementById('precio-eyebrow').innerHTML = uName ? uName + ', aqui tienes tu acceso' : 'Aqui tienes tu acceso';"

$content | Set-Content $path -Encoding UTF8
Write-Host "Listo"