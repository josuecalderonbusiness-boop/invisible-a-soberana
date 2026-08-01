// api/v1/programa/[programa_id]/resolver-edicion.js — Conversación 1 del contrato Orbit ↔ Mi Espacio (DR-006/DR-007).
// POST /api/v1/programa/{programa_id}/resolver-edicion

import { resolverEdicion, autenticado } from '../../../_lib/programa.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!autenticado(req)) return res.status(401).json({ error: 'no autorizado' });

  const { programa_id } = req.query;
  if (!programa_id) return res.status(400).json({ error: 'programa_id requerido' });

  try {
    const resultado = await resolverEdicion(programa_id);
    return res.status(200).json(resultado);
  } catch (err) {
    console.error('resolver-edicion error:', err.message);
    return res.status(500).json({ error: 'error interno' });
  }
}
