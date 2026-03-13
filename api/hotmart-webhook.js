export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const body = req.body;
    console.log('Hotmart webhook received:', JSON.stringify(body));

    // Extraer email del payload de Hotmart
    const email =
      body?.data?.buyer?.email ||
      body?.buyer?.email ||
      body?.email ||
      null;

    if (!email) {
      console.log('No email found in payload');
      return res.status(200).json({ received: true, action: 'no_email' });
    }

    const BREVO_KEY = process.env.BREVO_KEY;

    // Buscar contacto en Brevo
    const searchRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'GET',
        headers: { 'api-key': BREVO_KEY }
      }
    );

    if (!searchRes.ok) {
      console.log('Contact not found in Brevo:', email);
      return res.status(200).json({ received: true, action: 'contact_not_found' });
    }

    const contact = await searchRes.json();
    const currentLists = contact.listIds || [];

    // Listas de secuencias activas (S=7, P=8, D=9)
    const sequenceLists = [7, 8, 9];

    // Listas de las que hay que sacarla
    const listsToRemove = currentLists.filter(id => sequenceLists.includes(id));

    // Mover a lista Compradoras (#11) y sacar de secuencias
    const updateRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_KEY
        },
        body: JSON.stringify({
          listIds: [11],
          unlinkListIds: listsToRemove
        })
      }
    );

    console.log('Brevo update status:', updateRes.status);

    return res.status(200).json({
      received: true,
      action: 'moved_to_compradoras',
      email,
      removedFromLists: listsToRemove
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ received: true, error: err.message });
  }
}
