export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, firstName, lastName, profile } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const BREVO_KEY = process.env.BREVO_KEY;
    const BREVO_LIST_ID = 2;

    // 1. Crear/actualizar contacto en Brevo y agregarlo a la lista
    const contactRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_KEY
      },
      body: JSON.stringify({
        email,
        attributes: {
          FIRSTNAME: firstName,
          LASTNAME: lastName || '',
          QUIZ_PROFILE: profile || ''
        },
        listIds: [BREVO_LIST_ID],
        updateEnabled: true
      })
    });

    const contactData = await contactRes.json();
    console.log('Brevo contact response:', JSON.stringify(contactData));

    // 2. Enviar email de resultado via Brevo
    const vslUrl    = 'https://codigosoberana.josuecalderon.lat';
    const resultUrl = `https://invisible-a-soberana.josuecalderon.lat?p=${profile}&name=${encodeURIComponent(firstName)}`;

    const emailHtml = `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><style>
body{margin:0;padding:0;background:#0F0A0B;font-family:Georgia,serif;}
.wrap{max-width:580px;margin:0 auto;background:#0F0A0B;}
.header{background:linear-gradient(135deg,#3D0C11,#6B1A2A);padding:40px 32px;text-align:center;}
.header h1{font-size:22px;color:#F5E4B0;margin:0;font-weight:400;letter-spacing:0.05em;}
.header p{font-size:11px;color:#B8892A;letter-spacing:0.2em;text-transform:uppercase;margin:8px 0 0;}
.body{padding:44px 40px;}
.body p{font-size:16px;line-height:1.85;color:#C4A8B0;margin:0 0 20px;}
.body p strong{color:#F0E6EA;}
.btn-wrap{text-align:center;margin:32px 0;}
.btn{display:inline-block;background:#B8892A;color:#0F0A0B;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:16px 36px;}
.btn-sec{display:inline-block;border:1px solid #B8892A;color:#B8892A;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none;padding:14px 36px;}
.div{height:1px;background:rgba(184,137,42,0.3);margin:32px 0;}
.sig{padding:0 40px 44px;}
.sig p{font-size:14px;line-height:1.8;color:#6B4050;margin:0;}
.foot{background:#1C1114;padding:20px 32px;text-align:center;}
.foot p{font-size:11px;color:#3A2030;margin:0;}
</style></head>
<body><div class="wrap">
  <div class="header">
    <p>Para ${firstName}</p>
    <h1>Tu resultado está aquí</h1>
  </div>
  <div class="body">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Hiciste el test. Y eso ya dice algo de ti — las mujeres que evitan conocerse no llegan hasta el final.</p>
    <p>Aquí está tu resultado completo:</p>
    <div class="btn-wrap"><a href="${resultUrl}" class="btn">→ Ver mi resultado</a></div>
    <div class="div"></div>
    <p>Y hay algo más que necesitas ver.</p>
    <p>Lo que encontré después de 15 años dentro de mi matrimonio va a cambiar la forma en que ves todo lo que estás viviendo con tu pareja hasta hoy.</p>
    <div class="btn-wrap"><a href="${vslUrl}" class="btn-sec">→ Quiero verlo</a></div>
  </div>
  <div class="sig">
    <p>— <strong>Josué Calderón</strong><br><em>15 años de matrimonio. Sé lo que es estar del otro lado.</em></p>
  </div>
  <div class="foot">
    <p>© 2026 Josué Calderón · Código Soberana · josue@josuecalderon.lat</p>
  </div>
</div></body></html>`;

    const emailRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': BREVO_KEY
      },
      body: JSON.stringify({
        sender: { name: 'Josué Calderón', email: 'josue@josuecalderon.lat' },
        to: [{ email, name: firstName }],
        subject: `${firstName}, tu resultado está aquí`,
        htmlContent: emailHtml
      })
    });

    const emailData = await emailRes.json();
    console.log('Brevo email response:', JSON.stringify(emailData));

    return res.status(200).json({
      success: true,
      profile,
      messageId: emailData.messageId
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
