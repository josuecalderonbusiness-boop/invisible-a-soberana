export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { email, firstName, lastName, profile } = req.body;

    if (!email || !firstName) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    const API_KEY = 'pbaarbsupaf1zie1goimopy59e0uherhe2p2gu4sjh0goqru3rzpiw9o594kg6dy';
    const TAG_ID = 1901135;
    const CAMPAIGN_ID = 1087438;

    // 1. Crear o actualizar contacto
    const contactRes = await fetch('https://api.systeme.io/api/contacts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({
        email,
        firstName,
        lastName: lastName || '',
        fields: [{ slug: 'quiz_profile', value: profile || '' }]
      })
    });

    const contactData = await contactRes.json();
    const contactId = contactData.id;

    if (!contactId) {
      console.error('No contact ID:', JSON.stringify(contactData));
      return res.status(500).json({ error: 'No contact ID', detail: contactData });
    }

    // 2. Asignar etiqueta
    await fetch(`https://api.systeme.io/api/contacts/${contactId}/tags`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ tagId: TAG_ID })
    });

    // 3. Suscribir directamente a la campaña
    const campRes = await fetch(`https://api.systeme.io/api/campaigns/${CAMPAIGN_ID}/subscribers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY
      },
      body: JSON.stringify({ contactId })
    });

    const campData = await campRes.json();
    console.log('Campaign subscribe response:', JSON.stringify(campData));

    return res.status(200).json({
      success: true,
      contactId,
      profile,
      campaignStatus: campRes.status,
      campData
    });

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
