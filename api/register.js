exports.handler = async function(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { email, firstName, lastName, profile } = JSON.parse(event.body);

    if (!email || !firstName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) };
    }

    const API_KEY = 'pbaarbsupaf1zie1goimopy59e0uherhe2p2gu4sjh0goqru3rzpiw9o594kg6dy';
    const TAG_ID = 1901135;

    // 1. Crear o actualizar contacto
    const contactRes = await fetch('https://api.systeme.io/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        email,
        firstName,
        lastName: lastName || '',
        fields: [
          { slug: 'quiz_profile', value: profile || '' }
        ]
      })
    });

    const contactData = await contactRes.json();
    const contactId = contactData.id;

    if (!contactId) {
      console.error('No contact ID:', JSON.stringify(contactData));
      return { statusCode: 500, body: JSON.stringify({ error: 'No contact ID', detail: contactData }) };
    }

    // 2. Asignar etiqueta
    await fetch(`https://api.systeme.io/api/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ tagId: TAG_ID })
    });

    // 3. Enviar email directo via Systeme.io
    const vslUrl = 'https://codigosoberana.lovable.app';
    const resultUrl = `https://invisible-a-soberana.netlify.app?p=${profile}&name=${encodeURIComponent(firstName)}`;

    const emailBody = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body { margin:0; padding:0; background:#0F0A0B; font-family:'Georgia',serif; }
  .wrap { max-width:580px; margin:0 auto; background:#0F0A0B; }
  .header { background:linear-gradient(135deg,#3D0C11,#6B1A2A); padding:40px 32px; text-align:center; }
  .header h1 { font-family:Georgia,serif; font-size:22px; color:#F5E4B0; margin:0; font-weight:400; letter-spacing:0.05em; }
  .header p { font-size:11px; color:#B8892A; letter-spacing:0.2em; text-transform:uppercase; margin:8px 0 0; }
  .body { padding:44px 40px; }
  .body p { font-size:16px; line-height:1.85; color:#C4A8B0; margin:0 0 20px; }
  .body p strong { color:#F0E6EA; }
  .btn-wrap { text-align:center; margin:32px 0; }
  .btn { display:inline-block; background:linear-gradient(135deg,#7A5C1E,#B8892A); color:#0F0A0B; font-family:Georgia,serif; font-size:13px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; text-decoration:none; padding:16px 36px; }
  .btn-secondary { display:inline-block; background:transparent; border:1px solid #B8892A; color:#B8892A; font-family:Georgia,serif; font-size:13px; letter-spacing:0.12em; text-transform:uppercase; text-decoration:none; padding:14px 36px; }
  .divider { height:1px; background:linear-gradient(to right,transparent,rgba(184,137,42,0.3),transparent); margin:32px 0; }
  .signature { padding:0 40px 44px; }
  .signature p { font-size:14px; line-height:1.8; color:#6B4050; margin:0; }
  .signature strong { color:#8B5060; }
  .footer { background:#1C1114; padding:20px 32px; text-align:center; }
  .footer p { font-size:11px; color:#3A2030; margin:0; line-height:1.8; }
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <p>Para ${firstName}</p>
    <h1>Tu resultado está aquí</h1>
  </div>
  <div class="body">
    <p>Hola <strong>${firstName}</strong>,</p>
    <p>Hiciste el test. Y eso ya dice algo de ti — las mujeres que evitan conocerse no llegan hasta el final.</p>
    <p>Aquí está tu resultado completo:</p>
    <div class="btn-wrap">
      <a href="${resultUrl}" class="btn">→ Ver mi resultado</a>
    </div>
    <div class="divider"></div>
    <p>Y hay algo más que necesitas ver.</p>
    <p>Lo que encontré después de 15 años dentro de mi matrimonio va a cambiar la forma en que ves todo lo que estás viviendo con tu pareja hasta hoy.</p>
    <div class="btn-wrap">
      <a href="${vslUrl}" class="btn-secondary">→ Quiero verlo</a>
    </div>
  </div>
  <div class="signature">
    <p>— <strong>Josué Calderón</strong><br>
    <em>15 años de matrimonio. Sé lo que es estar del otro lado.</em></p>
  </div>
  <div class="footer">
    <p>© 2026 Josué Calderón · Código Soberana<br>josue@josuecalderon.lat</p>
  </div>
</div>
</body>
</html>`.trim();

    const emailRes = await fetch('https://api.systeme.io/api/send-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        to: email,
        subject: `${firstName}, tu resultado está aquí`,
        body: emailBody,
        senderName: 'Josué Calderón',
        senderEmail: 'josue@josuecalderon.lat'
      })
    });

    const emailData = await emailRes.json();
    console.log('Email API response:', JSON.stringify(emailData));

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        contactId,
        profile,
        emailStatus: emailRes.status,
        emailData
      })
    };

  } catch (err) {
    console.error('Register error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
