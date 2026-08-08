// api/_lib/correo1-masterclass.js — Correo 1 (transaccional inmediato) de EMAIL-COMMUNICATION-SYSTEM,
// primera instancia en 001-masterclass-soberana. Ver BREVO-AUTOMATIZACIONES-SPEC.md para el contrato
// funcional completo (evento, condiciones, variables, manejo de fallo, auditoría).
//
// Idempotencia (Hallazgo #1 de la auditoría, 2026-08-06): Hotmart puede mandar "Compra aprobada" +
// "Compra completa" para la misma compra — este módulo nunca reenvía si ya hay un envío ACEPTADO
// registrado para ese compra_id, mismo principio que ya usa BIENVENIDA_WA_ENVIADA para WhatsApp.
//
// Token de recuperación (Nivel 3 de RECUPERACION-DE-ACCESO-SYSTEM.md): reutiliza la infraestructura
// de tokens ya existente (api/_lib/auth-token.js — hash sha256 guardado, nunca el token en texto
// plano, expiración real, un solo uso) en vez de una colección propia — corregido 2026-08-07 tras
// la auditoría del punto #3 (recuperar-acceso.html), que encontró esta duplicación innecesaria en
// la primera versión de este archivo. El "correo" que auth-token.js guarda es, en este caso, el
// compra_id (email__producto) — mismo campo genérico, uso distinto, documentado aquí para que no
// se confunda con un correo real en este contexto puntual.
import { fsGet, fsUpdate, fsSet } from './firestore-rest.js';
import { enviarBienvenidaMasterclass } from './email-brevo.js';
import { crearToken } from './auth-token.js';

const MASTERCLASS_DASHBOARD_URL = 'https://invisible-a-soberana.josuecalderon.lat/mi-espacio';
// El dominio principal apaga /masterclass/mas-se-aleja/* por middleware.js (redirige a "/" hasta
// que se decida reabrir esa ruta ahi) — este enlace tiene que usar el dominio alterno donde esa
// ruta si esta activa, o el boton de recuperacion del Correo 1 nunca carga la pagina real.
const RECUPERACION_BASE_URL = 'https://he-intentado-todo-porque-nada-cambia.josuecalderon.lat/masterclass/mas-se-aleja/recuperar-acceso.html';
const TIPO_TOKEN_RECUPERACION = 'recuperacion_acceso_masterclass';
const HORAS_VALIDEZ_TOKEN = 168; // 7 días — no decidido en NO-RECIBI-MI-ACCESO-SPEC.md, criterio propio

async function crearTokenRecuperacion(compraId) {
  // crearToken tiene su propio cooldown de 60s contra doble-envío casi simultáneo — heredado
  // gratis de auth-token.js, no había que reimplementarlo.
  return crearToken(compraId, TIPO_TOKEN_RECUPERACION, HORAS_VALIDEZ_TOKEN);
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
  if (!token) {
    // Cooldown de crearToken (60s) — un token ya se emitió hace muy poco para esta compra (ej.
    // segundo webhook de Hotmart, "Compra completa" detrás de "Compra aprobada", con el primer
    // intento de envío todavía fallando). No se manda un enlace roto ("?t=null") — se deja para
    // el próximo intento real en vez de construir un mecanismo de reintento aparte para este caso raro.
    console.log('Correo 1: token de recuperación en cooldown, se omite este intento:', compraId);
    return { ok: false, error: 'token_en_cooldown' };
  }
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
