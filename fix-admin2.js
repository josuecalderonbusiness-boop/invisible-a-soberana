const fs = require('fs');
let content = fs.readFileSync('public/admin/index.html', 'utf8');

const fn = `
async function enviarNotifSabado(semNum, tipo) {
  const statusEl = document.getElementById('s' + semNum + '-notif-status');
  statusEl.textContent = 'Enviando...';
  statusEl.className = 'sesion-status';

  const mensajes = {
    '24h':      { title: 'Manana - Sesion en Vivo Soberana', body: 'La sesion del sabado es manana. Reserva tu espacio de 2 horas.' },
    '1h':       { title: 'En 1 hora - Sesion en Vivo', body: 'La sesion comienza en 60 minutos. Prepara tu espacio y tu energia.' },
    'live':     { title: 'EN VIVO - Entra ahora', body: 'La sesion del sabado acaba de comenzar. Tu lugar te esta esperando.' },
    'ausentes': { title: 'La clase sigue en vivo sin ti', body: 'Aun estas a tiempo de unirte. La sesion continua ahora mismo.' }
  };

  const msg = mensajes[tipo];
  if (!msg) return;

  try {
    const resp = await fetch('https://sendpushnotification-xfy54diwdq-uc.a.run.app', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminKey: 'Sob3rana@Admin2026',
        nombre: msg.title,
        mensaje: msg.body,
        tipo: 'sistema'
      })
    });
    const data = await resp.json();
    statusEl.textContent = 'Enviadas: ' + (data.enviadas || 0);
    statusEl.className = 'sesion-status ok';
  } catch(e) {
    statusEl.textContent = 'Error: ' + e.message;
    statusEl.className = 'sesion-status error';
  }
}
`;

content = content.replace('// -- Utilities', fn + '\n// -- Utilities');
fs.writeFileSync('public/admin/index.html', content, 'utf8');
console.log('OK');
