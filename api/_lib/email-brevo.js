// api/_lib/email-brevo.js — EmailService: única capa que conoce la API de Brevo.
//
// El resto del sistema de Login llama solo a enviarConfirmacionCorreo/enviarRecuperacion —
// nunca a Brevo directamente. Cambiar de proveedor de correo el día de mañana es escribir un
// adaptador nuevo con esta misma interfaz, sin tocar el resto del Login (auditoría de
// arquitectura de 3.1, 2026-08-01).

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

async function enviarCorreo({ destinatario, asunto, html }) {
  // BREVO_KEY (no BREVO_API_KEY) — reutiliza la misma clave ya configurada y en uso por
  // hotmart-webhook.js/register.js, en vez de pedir una segunda credencial para el mismo
  // proveedor (corregido al validar el entorno real, 2026-08-02).
  const apiKey = process.env.BREVO_KEY;
  const remitente = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !remitente) throw new Error('BREVO_KEY / BREVO_SENDER_EMAIL no configuradas');

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: remitente, name: 'Mi Espacio' },
      to: [{ email: destinatario }],
      subject: asunto,
      htmlContent: html
    })
  });
  if (!res.ok) {
    const texto = await res.text().catch(() => '');
    throw new Error(`Brevo respondió ${res.status}: ${texto.slice(0, 300)}`);
  }
}

// No bloquea nada — la cuenta ya está creada y con sesión activa cuando este correo se
// envía. Es una invitación, no un requisito (decisión de negocio 2026-08-01).
async function enviarConfirmacionCorreo(destinatario, enlace) {
  await enviarCorreo({
    destinatario,
    asunto: 'Confirma tu correo en Mi Espacio',
    html: `<p>Hola,</p><p>Ya puedes disfrutar de tu experiencia en Mi Espacio. Confirma tu correo para mantener tu cuenta protegida y recibir las novedades de tus programas:</p><p><a href="${enlace}">${enlace}</a></p><p>Este enlace es válido por 7 días.</p>`
  });
}

async function enviarRecuperacion(destinatario, enlace) {
  await enviarCorreo({
    destinatario,
    asunto: 'Vuelve a entrar a tu espacio',
    html: `<p>Hola,</p><p>Alguien pidió restablecer la contraseña de esta cuenta. Si fuiste tú, elige una nueva aquí:</p><p><a href="${enlace}">${enlace}</a></p><p>Este enlace es válido por 1 hora. Si no fuiste tú, no te preocupes — puedes ignorar este correo y tu contraseña seguirá siendo la misma.</p>`
  });
}

export { enviarConfirmacionCorreo, enviarRecuperacion };
