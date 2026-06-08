$path = "public\workbook\index.html"
$content = Get-Content $path -Encoding UTF8 -Raw

$old = '          <div style="display:none">
            <iframe id="pod-iframe-${tema.num}"
              src="https://iframe.mediadelivery.net/embed/${libId}/${tema.bunnyVideoId}?autoplay=false&loop=false&muted=false&preload=true&responsive=true"
              allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;screen-wake-lock"
              allowfullscreen style="width:1px;height:1px">
            </iframe>
          </div>
        </div>`'

$new = '          <audio id="pod-audio-${tema.num}" src="PENDIENTE_URL_MP3" preload="metadata" style="display:none"></audio>
        </div>
        <div class="pod-reveal-screen" id="pod-reveal-${tema.num}">
          <button class="pod-reveal-btn" onclick="slideAvanzar()">
            <div class="pod-reveal-btn-text">\u00bfCu\u00e1les son las<br>4 dimensiones?</div>
            <div class="pod-reveal-btn-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </button>
        </div>`'

$content = $content.Replace($old, $new)
$content | Set-Content $path -Encoding UTF8
Write-Host "Listo."