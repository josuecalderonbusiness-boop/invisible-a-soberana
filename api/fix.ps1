$path = "api\hotmart-webhook.js"
$content = Get-Content $path -Encoding UTF8 -Raw
$content = $content.Replace(
"function now() {",
"async function guardarEnFirestore(email, nombre, tipo) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const { google } = await import('googleapis');
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/datastore']
    });
    const token = await auth.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/soberana-app/databases/(default)/documents/workbook_acceso/${encodeURIComponent(email)}`;
    await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          nombre: { stringValue: nombre },
          activo: { booleanValue: true },
          tipo: { stringValue: tipo },
          fecha: { stringValue: new Date().toISOString() }
        }
      })
    });
    console.log('Firestore workbook_acceso actualizado:', email);
  } catch(err) {
    console.error('Error Firestore:', err.message);
  }
}

function now() {"
)
$content | Set-Content $path -Encoding UTF8