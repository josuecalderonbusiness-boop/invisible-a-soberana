const fs = require('fs');
let content = fs.readFileSync('public/admin/index.html', 'utf8');

const old = `        <button class="btn-save-sesion" id="s\${semNum}-btn" onclick="guardarSesion(\${semNum})">
          Guardar Semana \${semNum}
        </button>
        <div class="sesion-status" id="s\${semNum}-status"></div>
      </div>
    \`;`;

const newCode = `        <button class="btn-save-sesion" id="s\${semNum}-btn" onclick="guardarSesion(\${semNum})">
          Guardar Semana \${semNum}
        </button>
        <div class="sesion-status" id="s\${semNum}-status"></div>
        <div style="margin-top:12px;display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <button onclick="enviarNotifSabado(\${semNum},'24h')" style="padding:10px;border-radius:8px;border:1px solid rgba(184,137,42,0.3);background:rgba(184,137,42,0.1);color:#D4AF6A;font-size:12px;cursor:pointer">
            Enviar Manana
          </button>
          <button onclick="enviarNotifSabado(\${semNum},'1h')" style="padding:10px;border-radius:8px;border:1px solid rgba(184,137,42,0.3);background:rgba(184,137,42,0.1);color:#D4AF6A;font-size:12px;cursor:pointer">
            Enviar 1 hora
          </button>
          <button onclick="enviarNotifSabado(\${semNum},'live')" style="padding:10px;border-radius:8px;border:1px solid rgba(201,64,64,0.3);background:rgba(201,64,64,0.1);color:#FF9090;font-size:12px;cursor:pointer">
            EN VIVO
          </button>
          <button onclick="enviarNotifSabado(\${semNum},'ausentes')" style="padding:10px;border-radius:8px;border:1px solid rgba(139,26,47,0.3);background:rgba(139,26,47,0.1);color:#c9969b;font-size:12px;cursor:pointer">
            Ausentes
          </button>
        </div>
        <div class="sesion-status" id="s\${semNum}-notif-status"></div>
      </div>
    \`;`;

content = content.replace(old, newCode);
fs.writeFileSync('public/admin/index.html', content, 'utf8');
console.log('OK');
