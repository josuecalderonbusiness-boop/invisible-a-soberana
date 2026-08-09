// scripts/crear-catalogo-masterclass.js — crea el registro fundacional del catálogo de
// masterclasses (Firestore, colección masterclass_catalogo). Fuente documental de la identidad
// permanente de cada masterclass (programa_id) — todavía NO es fuente de ejecución del código
// (MASTERCLASS_PRODUCT_ID/EVENTO_FIN/LIST_ID en hotmart-webhook.js y whatsapp.js siguen siendo
// las constantes que el código realmente usa hasta la fase en que se generalicen).
//
// Uso: node --env-file=.env.local scripts/crear-catalogo-masterclass.js
import { fsSet, fsGet } from '../api/_lib/firestore-rest.js';

const PROGRAMA_ID = 'mas-se-aleja';

async function main() {
  const existente = await fsGet('masterclass_catalogo', PROGRAMA_ID);
  if (existente) {
    console.log('El documento ya existe, no se sobreescribe:', JSON.stringify(existente, null, 2));
    return;
  }

  await fsSet('masterclass_catalogo', PROGRAMA_ID, {
    programa_id: PROGRAMA_ID,
    nombre_comercial: 'He intentado de todo... ¿por qué nada cambia?',
    hotmart_product_id: '8128025',
    fecha_evento: '2026-08-22T19:00:00-05:00',
    lista_brevo_id: 19,
    estado: 'LIVE',
    creado_en: new Date().toISOString()
  });

  console.log('masterclass_catalogo/mas-se-aleja creado.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
