// scripts/test-recuperacion-acceso.js — prueba sintética de los Escenarios A-E del motor
// resolverContingenciaAcceso (RECUPERACION-DE-ACCESO-SYSTEM.md), incluyendo el caso de
// comunicación suspendida (REFUND-MANAGEMENT-SYSTEM.md).
//
// No envía WhatsApp ni correos reales: resolverContingenciaAcceso solo lee/escribe Firestore.
// Usa una compra de prueba con teléfono claramente marcado (prefijo 999) para no chocar con
// datos reales, y la borra al final.
//
// Uso: node --env-file=.env.local scripts/test-recuperacion-acceso.js

import { fsSet, fsDelete } from '../api/_lib/firestore-rest.js';
import { resolverContingenciaAcceso } from '../api/_lib/recuperacion-acceso.js';

const TELEFONO_PRUEBA = '9990000001';
const COMPRA_ID = 'test-recuperacion-acceso@example.com__masterclass-soberana';

let fallos = 0;

function check(nombre, condicion, detalle) {
  if (condicion) {
    console.log(`✅ ${nombre}`);
  } else {
    fallos++;
    console.log(`❌ ${nombre} — ${detalle}`);
  }
}

async function resetCompra(datosExtra) {
  await fsSet('masterclass_compras', COMPRA_ID, {
    email: 'test-recuperacion-acceso@example.com',
    nombre: 'Prueba',
    producto: 'masterclass-soberana',
    telefono: TELEFONO_PRUEBA,
    contingencia_usada: false,
    ...datosExtra
  });
}

async function main() {
  console.log('--- Escenario A: sin compra con ese teléfono ---');
  await fsDelete('masterclass_compras', COMPRA_ID); // asegura que no exista
  const a = await resolverContingenciaAcceso({ telefono: '9990000000', origen: 'test' });
  check('Escenario A → escalar, no reenviar', a.escenario === 'A' && a.escalar === true && a.reenviar === false, JSON.stringify(a));

  console.log('\n--- Escenario B: compra existe, bienvenida nunca enviada ---');
  await resetCompra({ bienvenida_estado: null });
  const b = await resolverContingenciaAcceso({ telefono: TELEFONO_PRUEBA, origen: 'test' });
  check('Escenario B → reenviar', b.escenario === 'B' && b.reenviar === true && b.escalar === false, JSON.stringify(b));

  console.log('\n--- Escenario C: bienvenida previa con ERROR ---');
  await resetCompra({ bienvenida_estado: 'ERROR' });
  const c = await resolverContingenciaAcceso({ telefono: TELEFONO_PRUEBA, origen: 'test' });
  check('Escenario C → reenviar', c.escenario === 'C' && c.reenviar === true, JSON.stringify(c));

  console.log('\n--- Escenario D: bienvenida previa ACEPTADA (beneficio de la duda) ---');
  await resetCompra({ bienvenida_estado: 'ACEPTADO' });
  const d = await resolverContingenciaAcceso({ telefono: TELEFONO_PRUEBA, origen: 'test' });
  check('Escenario D → reenviar', d.escenario === 'D' && d.reenviar === true, JSON.stringify(d));

  console.log('\n--- Escenario E: freno anti-bucle (contingencia_usada ya true) ---');
  await resetCompra({ bienvenida_estado: null, contingencia_usada: true });
  const e = await resolverContingenciaAcceso({ telefono: TELEFONO_PRUEBA, origen: 'test' });
  check('Escenario E → escalar, no reenviar', e.escenario === 'E' && e.escalar === true && e.reenviar === false, JSON.stringify(e));

  console.log('\n--- Comunicación suspendida (Refund Management): nunca reenvía aunque sea B/C/D ---');
  await resetCompra({ bienvenida_estado: null, contingencia_usada: false, comunicacion_suspendida: true });
  const s = await resolverContingenciaAcceso({ telefono: TELEFONO_PRUEBA, origen: 'test' });
  check('Suspendida → escalar, no reenviar', s.escenario === 'SUSPENDIDA' && s.escalar === true && s.reenviar === false, JSON.stringify(s));

  await fsDelete('masterclass_compras', COMPRA_ID);
  console.log('\nCompra de prueba eliminada.');

  console.log(fallos === 0 ? '\n🎉 TODOS LOS ESCENARIOS PASARON' : `\n⚠️ ${fallos} escenario(s) fallaron`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch(err => {
  console.error('Error inesperado en la prueba:', err);
  process.exit(1);
});
