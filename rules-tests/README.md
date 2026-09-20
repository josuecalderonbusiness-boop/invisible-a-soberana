# rules-tests — pruebas de `firestore.rules`

Pruebas automáticas de las reglas de Firestore contra el **Firestore Emulator** (proyecto `demo-…`, nunca producción).
Las reglas actuales se publicaron el 2026-09-20 desde el commit `bb79e6f` (Seguridad, Fase 2).

## Cómo correrlas
```
cd rules-tests
npm install
npm test
```
- Requiere **JDK 21 o superior** en el `PATH` o vía `JAVA_HOME` (`firebase-tools` 15 no acepta Java anterior). En esta máquina hay un JDK 21 portátil en `C:\Users\Usuario\tools\jdk-21.0.12.1+1`; úsalo solo dentro del proceso:
  `JAVA_HOME=/c/Users/Usuario/tools/jdk-21.0.12.1+1 PATH=$JAVA_HOME/bin:$PATH npm test`
- Requiere `firebase` (CLI) instalado. El script fija `FIRESTORE_EMULATOR_HOST`; las pruebas **se niegan a correr** sin emulador.
- **Nunca** correr `node --test` a secas en este repositorio (ejecuta `test-notif.js` y `test-evento.js`, que tienen efectos reales en Firebase).

## Qué cubren
- `firestore-rules.test.js` (SDK modular): operaciones que el PWA necesita (permitir), lecturas/listados/escrituras que deben quedar cerrados (denegar), la `adminKey` antigua **denegada** (con control: las reglas anteriores, commit `39dcfbb`, la aceptaban), `serverTimestamp`/`increment`, Admin SDK y REST con token de servicio (las reglas no aplican al backend).
- `firestore-rules-compat.test.js`: las mismas operaciones con el SDK **exacto del PWA** (`firebase-*-compat` 9.23.0).
- La clave antigua se lee en memoria de las reglas del commit `39dcfbb`; nunca se imprime ni queda escrita en las pruebas.

## Para cambiar las reglas
1. Editar `firestore.rules`. 2. Correr `npm test`. 3. Comprobar que las pruebas detectan un debilitamiento deliberado de la regla (mutación) antes de confiar en ellas. 4. Publicar con `firebase deploy --only firestore:rules` **solo con autorización explícita y una ventana con verificación de solo lectura y rollback preparado** (ver el checklist de la ventana del 2026-09-20 en la memoria del proyecto).
