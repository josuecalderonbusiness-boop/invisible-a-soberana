// api/v1/autorizar-programa.js — proxy server-side de la Conversación 3 del
// contrato Orbit ↔ Mi Espacio (DR-006/DR-007). Existe porque el secreto
// compartido (ORBIT_SHARED_SECRET) nunca debe viajar al navegador — el
// frontend llama a este endpoint, y este llama a Orbit.
//
// BLOQUEO DE ARQUITECTURA (no un pendiente técnico): este endpoint NO está
// conectado al login real de Mi Espacio ni a mi-espacio-login.js. Recibe
// persona_id como parámetro porque hoy no existe ningún mecanismo por el que
// Mi Espacio conozca el persona_id real de un alumno — eso es diseño de
// Fase 3 (identidad + enlace personalizado desde Orbit hacia Mi Espacio).
// Hasta que ese mecanismo exista y se apruebe, este endpoint solo puede
// probarse con un persona_id conocido de antemano, nunca desde el flujo
// real de un alumno.

const ORBIT_BASE_URL = process.env.ORBIT_BASE_URL; // sin default: no hay URL de producción confirmada todavía
const ORBIT_SHARED_SECRET = process.env.ORBIT_SHARED_SECRET;
const TIMEOUT_MS = 5000;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { persona_id: personaId, programa_id: programaId } = req.query;
  if (!personaId || !programaId) {
    return res.status(400).json({ error: 'persona_id y programa_id son requeridos' });
  }
  if (!ORBIT_SHARED_SECRET || !ORBIT_BASE_URL) {
    return res.status(200).json({ resultado: 'NO_VERIFICADO', motivo: 'ORBIT_BASE_URL u ORBIT_SHARED_SECRET no configurados' });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const url = `${ORBIT_BASE_URL}/api/v1/programa/${encodeURIComponent(programaId)}/autorizacion/${encodeURIComponent(personaId)}`;
    const orbitRes = await fetch(url, {
      headers: { 'x-orbit-secret': ORBIT_SHARED_SECRET },
      signal: controller.signal,
    });
    if (!orbitRes.ok) {
      return res.status(200).json({ resultado: 'NO_VERIFICADO', motivo: `orbit_respondio_${orbitRes.status}` });
    }
    const data = await orbitRes.json();
    if (data.resultado === 'PERMITIR' || data.resultado === 'DENEGAR') {
      return res.status(200).json({ resultado: data.resultado });
    }
    return res.status(200).json({ resultado: 'NO_VERIFICADO', motivo: 'respuesta_inesperada' });
  } catch (err) {
    const motivo = err.name === 'AbortError' ? 'timeout' : `error_red: ${err.message}`;
    return res.status(200).json({ resultado: 'NO_VERIFICADO', motivo });
  } finally {
    clearTimeout(timeoutId);
  }
}
