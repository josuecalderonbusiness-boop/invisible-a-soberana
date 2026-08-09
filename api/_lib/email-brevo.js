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

// Correo 1 (transaccional inmediato) de EMAIL-COMMUNICATION-SYSTEM, primera instancia en
// 001-masterclass-soberana — ver BREVO-AUTOMATIZACIONES-SPEC.md. Plantilla "Simple": texto,
// mínimo HTML, prioriza entregabilidad e inmediatez sobre estética. Sigue REGLA-COPY-EXPERIENCIA.md
// (nunca "Masterclass" en el texto visible). El enlace de recuperación es el Nivel 3 de
// RECUPERACION-DE-ACCESO-SYSTEM.md — ver correo1-masterclass.js para el token que lo protege.
async function enviarBienvenidaMasterclass(destinatario, nombre, urlMiEspacio, urlRecuperacion) {
  const saludo = nombre ? `Hola ${nombre} 💛` : 'Hola 💛';
  await enviarCorreo({
    destinatario,
    asunto: 'Tu lugar en tu Experiencia Soberana ya quedó reservado 💛',
    html: `
<div style="font-family: Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #2b2320;">
  <p style="font-size: 16px; margin: 0 0 16px;">${saludo}</p>
  <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
    Ya estás dentro. Tu lugar quedó confirmado — bienvenida a tu experiencia.
  </p>
  <div style="text-align: center; margin: 0 0 28px;">
    <a href="${urlMiEspacio}" style="display: inline-block; background: #b8892a; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: bold; padding: 14px 32px; border-radius: 8px;">
      Entrar a Mi Espacio
    </a>
    <p style="font-size: 13px; margin: 14px 0 0;">
      <a href="https://www.google.com/calendar/render?action=TEMPLATE&text=Experiencia+Soberana&dates=20260823T000000Z/20260823T011500Z&details=Tu+experiencia+ya+est%C3%A1+reservada.+Accede+desde+tu+Espacio.&location=https://invisible-a-soberana.josuecalderon.lat/mi-espacio" style="color:#b8892a;text-decoration:none;">📅 Agregar el sábado 22 de agosto a mi calendario</a>
    </p>
  </div>
  <p style="font-size: 13px; line-height: 1.6; color: #8a7d72; border-top: 1px solid #e8e1d8; padding-top: 20px; margin: 0;">
    ¿No recibiste nuestro mensaje por WhatsApp? Es posible que el número haya quedado mal escrito
    o que haya ocurrido un problema con la entrega.
    <a href="${urlRecuperacion}" style="color: #b8892a;">Haz clic aquí para confirmar tu número de WhatsApp.</a>
  </p>
  <p style="text-align:center;font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:10px;color:#a89a8c;margin:24px 0 0;">Invisible a Soberana<sup style="font-size:8px;">™</sup></p>
</div>`
  });
}

export { enviarConfirmacionCorreo, enviarRecuperacion, enviarBienvenidaMasterclass };
