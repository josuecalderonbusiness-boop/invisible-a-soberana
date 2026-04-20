/**
 * fetch-logs.js — logs de ejecución de onEventoProgreso
 */
const https = require('https');
const fs    = require('fs');

const PROJECT  = 'soberana-app';
const CRED_PATH = 'C:\\Users\\Usuario\\.config\\configstore\\firebase-tools.json';
const since    = '2026-04-16T23:48:00Z';

function queryLogs(token, filter, pageSize = 80) {
  const body = JSON.stringify({ resourceNames: [`projects/${PROJECT}`], filter, orderBy: 'timestamp asc', pageSize });
  return new Promise((resolve, reject) => {
    const buf = Buffer.from(body);
    https.request({
      hostname: 'logging.googleapis.com', path: '/v2/entries:list', method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': buf.length },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => { try { resolve(JSON.parse(raw)); } catch { reject(new Error(raw.slice(0, 200))); } });
    }).on('error', reject).end(buf);
  });
}

async function main() {
  const token = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8')).tokens?.access_token;
  if (!token) { console.error('No hay token. Corre: firebase login'); return; }

  // Todos los logs del servicio en la ventana del test
  const r = await queryLogs(token,
    `resource.labels.service_name=~"oneventoprogreso" AND timestamp>="${since}"`);

  if (r.error) { console.error('Error API:', r.error.message); return; }

  const entries = r.entries || [];
  console.log(`\n── ${entries.length} entradas para onEventoProgreso desde ${since} ──\n`);

  for (const e of entries) {
    const ts  = (e.timestamp || '').slice(0, 23);
    const sev = (e.severity || 'DEFAULT').padEnd(9);
    const ln  = (e.logName || '').split('/logs/')[1] || '';

    let msg = '';
    if (e.textPayload)              msg = e.textPayload;
    else if (e.jsonPayload)         msg = JSON.stringify(e.jsonPayload);
    else if (e.httpRequest) {
      const h = e.httpRequest;
      msg = `HTTP ${h.requestMethod} ${h.requestUrl} → ${h.status} (${h.latency || ''})`;
    } else if (e.protoPayload)      msg = JSON.stringify(e.protoPayload).slice(0, 200);
    else                            msg = '(sin payload)';

    console.log(`[${ts}] ${sev} [${ln}]`);
    console.log(`  ${msg.slice(0, 300)}`);
    console.log();
  }

  // Resumen
  const invocaciones = entries.filter(e => e.logName?.includes('requests'));
  const errores      = entries.filter(e => e.severity === 'ERROR' || e.severity === 'CRITICAL');
  const stdoutLines  = entries.filter(e => e.logName?.includes('stdout'));

  console.log('── Resumen ──────────────────────────────────────');
  console.log(`  Invocaciones (requests log) : ${invocaciones.length}`);
  console.log(`  Líneas stdout (console.log) : ${stdoutLines.length}`);
  console.log(`  Errores                     : ${errores.length}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
