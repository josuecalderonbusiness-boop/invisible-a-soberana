export default async function handler(req, res) {

  // Solo acepta llamadas con el token secreto correcto
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const currentToken = process.env.WHATSAPP_TOKEN;
    
    // Llamar a Meta API para extender el token
    const response = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?` +
      `grant_type=fb_exchange_token` +
      `&client_id=${process.env.META_APP_ID}` +
      `&client_secret=${process.env.META_APP_SECRET}` +
      `&fb_exchange_token=${currentToken}`
    );

    const data = await response.json();
    console.log('Token refresh response:', JSON.stringify(data));

    if (data.access_token) {
      // Actualizar el token en Vercel via API
      const vercelRes = await fetch(
        `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/env`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const envData = await vercelRes.json();
      const waTokenEnv = envData.envs?.find(e => e.key === 'WHATSAPP_TOKEN');
      
      if (waTokenEnv) {
        // Update existing env variable
        await fetch(
          `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/env/${waTokenEnv.id}`,
          {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ value: data.access_token })
          }
        );

        // Trigger redeploy
        await fetch(
          `https://api.vercel.com/v13/deployments`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              name: 'invisible-a-soberana',
              gitSource: {
                type: 'github',
                repoId: process.env.GITHUB_REPO_ID,
                ref: 'main'
              }
            })
          }
        );

        console.log('Token renovado y redeploy iniciado');
        return res.status(200).json({ 
          success: true, 
          message: 'Token renovado exitosamente',
          expires_in: data.expires_in
        });
      }
    }

    return res.status(500).json({ error: 'No se pudo renovar el token', data });

  } catch (error) {
    console.error('Error renovando token:', error);
    return res.status(500).json({ error: error.message });
  }
}
