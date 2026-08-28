// scripts/crear-campanas-correo-2-3-4.js — crea las 3 campanas de Brevo (Correo 2/3/4,
// EMAIL-COMMUNICATION-SYSTEM.md seccion 8) como BORRADOR unicamente. Deliberadamente NO se envia
// "scheduledAt" en la creacion -- eso es lo que evita que Brevo la programe/active sola. Programar
// el envio real es un paso aparte, manual, que Josue decide cuando este listo.
//
// Uso: node --env-file=.env.local scripts/crear-campanas-correo-2-3-4.js
const BREVO_KEY = process.env.BREVO_KEY;
const SENDER_ID = 2; // josue@josuecalderon.lat
const MI_ESPACIO_URL = 'https://invisible-a-soberana.josuecalderon.lat/mi-espacio';
const SALA_SOBERANA_URL = 'https://chat.whatsapp.com/KN5j1mzi6Z79HDMV2Vuiba';

function botonDorado(texto, url) {
  return `<a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#7A5C1E,#B8892A,#D4A843);color:#ffffff;text-decoration:none;font-family:'Jost',Arial,sans-serif;font-size:15px;font-weight:700;padding:14px 30px;border-radius:10px;">${texto}</a>`;
}

const htmlBranded = (parrafos, botones, tagline) => `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:480px;margin:0 auto;background:#1E1218;color:#F0E6EA;padding:40px 28px;border-radius:12px;">
  ${parrafos.map(p => `<p style="font-size:16px;line-height:1.6;margin:0 0 20px;">${p}</p>`).join('\n  ')}
  <div style="text-align:center;margin:28px 0;">
    ${botones.map(b => `<div style="margin-bottom:14px;">${b}</div>`).join('\n    ')}
  </div>
  <p style="font-size:14px;color:#C4A8B0;margin:0;">Nos vemos pronto,<br>Josué</p>
  <div style="text-align:center;margin-top:34px;padding-top:22px;border-top:1px solid rgba(184,137,42,.18);">
    <p style="font-family:'Jost',Arial,sans-serif;font-size:11px;color:rgba(240,230,234,.4);margin:0;">Josué Calderón © 2026</p>
    <p style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-weight:700;font-size:15px;color:#F0E6EA;margin:6px 0 0;">Invisible a Soberana<sup style="font-size:9px;">™</sup></p>
    <p style="font-family:Georgia,'Times New Roman',serif;font-size:11px;color:rgba(240,230,234,.4);margin:6px 0 0;">${tagline}</p>
  </div>
</div>`;

const htmlSimple = (texto, boton) => `
<div style="font-family:Georgia,'Times New Roman',serif;max-width:480px;margin:0 auto;padding:32px 24px;color:#2b2320;">
  <p style="font-size:17px;line-height:1.6;margin:0 0 24px;">${texto}</p>
  <div style="text-align:center;">
    ${boton}
  </div>
  <p style="text-align:center;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:10px;color:#a89a8c;margin:24px 0 0;">Invisible a Soberana<sup style="font-size:8px;">™</sup></p>
</div>`;

const campanas = [
  {
    tag: 'masterclass-correo2',
    name: 'MASTERCLASS — Correo 2 (T-7d) — mas-se-aleja',
    subject: 'Guarda la fecha: sábado 5 de septiembre, 7:00pm 💛',
    segmentId: 6,
    htmlContent: htmlBranded(
      [
        'Hola {{contact.FIRSTNAME}} 💛',
        'Ya diste un paso que muchas mujeres nunca se atreven a dar: te detuviste a preguntar por qué, después de intentarlo todo, nada cambia.',
        'El sábado 5 de septiembre a las 7:00pm (hora Colombia) vamos a hablar de eso — no de otra técnica más, sino de por qué mientras más te esfuerzas por salvar tu relación, más te vas perdiendo tú.',
        'Tu lugar ya está reservado. Guarda la fecha.'
      ],
      [
        botonDorado('Ver mi espacio', MI_ESPACIO_URL),
        'Mientras llega el sábado, hay un grupo de mujeres que ya están en este mismo camino — te espero ahí también.',
        botonDorado('Unirme a la Sala Soberana', SALA_SOBERANA_URL)
      ],
      'Porque una mujer que se encuentra... transforma todo lo que toca.'
    )
  },
  {
    tag: 'masterclass-correo3',
    name: 'MASTERCLASS — Correo 3 (T-24h) — mas-se-aleja',
    subject: 'Mañana es el día 💛 (sábado 5, 7:00pm)',
    segmentId: 7,
    htmlContent: htmlBranded(
      [
        'Hola {{contact.FIRSTNAME}} 💛',
        'Mañana, sábado, a las 7:00pm, nos vemos.',
        'Vas a entender por qué "intentarlo todo" nunca fue la solución — y qué es lo que sí cambia las cosas de verdad.',
        'Ten a la mano algo para tomar notas — vamos directo a lo que de verdad importa.'
      ],
      [botonDorado('Recordar mi acceso', MI_ESPACIO_URL)],
      'Porque una mujer que se encuentra... deja de sentirse sola.'
    )
  },
  {
    tag: 'masterclass-correo4',
    name: 'MASTERCLASS — Correo 4 (T-1h) — mas-se-aleja',
    subject: 'Empezamos en 1 hora ⏰',
    segmentId: 8,
    htmlContent: htmlSimple(
      '{{contact.FIRSTNAME}}, empezamos en 1 hora.',
      `<a href="${MI_ESPACIO_URL}" style="display:inline-block;background:#b8892a;color:#ffffff;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 32px;border-radius:8px;">Entrar ahora</a>`
    )
  }
];

async function main() {
  for (const c of campanas) {
    const body = {
      sender: { id: SENDER_ID },
      name: c.name,
      subject: c.subject,
      htmlContent: c.htmlContent,
      recipients: { segmentIds: [c.segmentId] }
      // Deliberadamente SIN scheduledAt — queda como borrador, sin programar ni enviar.
    };

    const res = await fetch('https://api.brevo.com/v3/emailCampaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': BREVO_KEY },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      console.error(`❌ ${c.name} → ${res.status}:`, JSON.stringify(data));
      continue;
    }
    console.log(`✅ ${c.name} → creada, id ${data.id}`);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
