// api/v1/edicion/[edicion_id]/estado.js — Conversación 2 del contrato Orbit ↔ Mi Espacio (DR-006/DR-007).
// GET /api/v1/edicion/{edicion_id}/estado

import { obtenerEstado, autenticado } from '../../../_lib/programa.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!autenticado(req)) return res.status(401).json({ error: 'no autorizado' });

  const { edicion_id } = req.query;
  if (!edicion_id) return res.status(400).json({ error: 'edicion_id requerido' });

  try {
    const estado = await obtenerEstado(edicion_id);
    if (!estado) return res.status(404).json({ error: 'edicion no encontrada' });
    return res.status(200).json({ edicion_id, estado });
  } catch (err) {
    console.error('estado error:', err.message);
    return res.status(500).json({ error: 'error interno' });
  }
}
