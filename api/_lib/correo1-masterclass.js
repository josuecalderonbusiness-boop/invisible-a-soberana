// api/_lib/correo1-masterclass.js — Correo 1 (transaccional inmediato) de EMAIL-COMMUNICATION-SYSTEM,
// primera instancia en 001-masterclass-soberana. Ver BREVO-AUTOMATIZACIONES-SPEC.md para el contrato
// funcional completo (evento, condiciones, variables, manejo de fallo, auditoría).
//
// Idempotencia (Hallazgo #1 de la auditoría, 2026-08-06): Hotmart puede mandar "Compra aprobada" +
// "Compra completa" para la misma compra — este módulo nunca reenvía si ya hay un envío ACEPTADO
// registrado para ese compra_id, mismo principio que ya usa BIENVENIDA_WA_ENVIADA para WhatsApp.
//
// Token de recuperación (Nivel 3 de RECUPERACION-DE-ACCESO-SYSTEM.md): aleatorio, único por compra,
// nunca el correo en texto plano en la URL — validado en la página de recuperación (pendiente de
// construir por separado, no en este módulo).

import { randomBytes } from 'node:crypto';
import { fsGet, fsSet, fsUpdate } from './firestore-rest.js';
import { enviarBienvenidaMasterclass } from './email-brevo.js';

const MASTERCLASS_DASHBOARD_URL = 'https://invisible-a-soberana.josuecalderon.lat/mi-espacio';
const RECUPERACION_BASE_URL = 'https://invisible-a-soberana.josuecalderon.lat/masterclass/mas-se-aleja/recuperar-acceso.html';

function generarToken() {
  return randomBytes(24).toString('base64url');
}

async function crearTokenRecuperacion(compraId) {
  const token = generarToken();
  await fsSet('recuperacion_tokens', token, {
    compra_id: compraId,
    usado: false,
    creado_en: new Date().toISOString()
  }, { exigirNoExiste: true });
  return token;
}

// Único punto de entrada. Se llama en paralelo al trigger de WhatsApp, nunca lo bloquea ni depende
// de él (aislado en try/catch por el propio caller, mismo patrón que el bloque de Orbit).
async function enviarCorreoInmediatoMasterclass({ email, nombre, producto, telefono }) {
  const compraId = `${email}__${producto}`;

  const existente = await fsGet('masterclass_compras', compraId);
  if (existente && existente.correo1_estado === 'ACEPTADO') {
    console.log('Correo 1 ya ACEPTADO para', compraId, '— no se reenvía (idempotencia)');
    return { ok: true, duplicado: true };
  }

  const token = await crearTokenRecuperacion(compraId);
  const urlRecuperacion = `${RECUPERACION_BASE_URL}?t=${token}`;

  const intentar = () => enviarBienvenidaMasterclass(email, nombre, MASTERCLASS_DASHBOARD_URL, urlRecuperacion);

  try {
    await intentar();
    await fsUpdate('masterclass_compras', compraId, {
      correo1_estado: 'ACEPTADO',
      correo1_fecha: new Date().toISOString()
    });
    console.log('Correo 1 ACEPTADO:', compraId);
    return { ok: true };
  } catch (errPrimerIntento) {
    console.error('Correo 1 primer intento falló:', compraId, errPrimerIntento.message);
    try {
      await intentar(); // 1 reintento automático inmediato (BREVO-AUTOMATIZACIONES-SPEC.md)
      await fsUpdate('masterclass_compras', compraId, {
        correo1_estado: 'ACEPTADO',
        correo1_fecha: new Date().toISOString()
      });
      console.log('Correo 1 ACEPTADO en el reintento:', compraId);
      return { ok: true, reintentado: true };
    } catch (errSegundoIntento) {
      console.error('Correo 1 ERROR tras reintento:', compraId, errSegundoIntento.message);
      await fsUpdate('masterclass_compras', compraId, {
        correo1_estado: 'ERROR',
        correo1_fecha: new Date().toISOString()
      });
      // Este correo ES el Nivel 3 de Recuperación de Acceso — su fallo no es un log silencioso,
      // genera revisión humana (mismo tratamiento que un Escenario A/E de NO-RECIBI-MI-ACCESO-SPEC.md).
      await fsSet('revision_pendiente', compraId, {
        motivo: 'correo1_fallo',
        detalle: errSegundoIntento.message,
        creado_en: new Date().toISOString()
      });
      return { ok: false, error: errSegundoIntento.message };
    }
  }
}

export { enviarCorreoInmediatoMasterclass };
