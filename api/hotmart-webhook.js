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

    // Extraer product ID del payload de Hotmart
    const productId =
      body?.data?.product?.id ||
      body?.product?.id ||
      null;

    console.log('Product ID:', productId);

    const BREVO_KEY = process.env.BREVO_KEY;

    // IDs de productos en Hotmart
    const WORKSHOP_PRODUCT_ID = null; // Workshop no tiene filtro — cualquier compra que no sea 7D va aquí
    const SOBERANA_7D_PRODUCT_ID = '7386435';

    // Determinar a qué lista mover según el producto comprado
    const isCompra7D = String(productId) === SOBERANA_7D_PRODUCT_ID;
    const targetList = isCompra7D ? 14 : 11; // 14 = Compradoras 7D, 11 = Compradoras Workshop

    console.log(`Compra detectada: ${isCompra7D ? 'Soberana 7D' : 'Workshop'} → Lista #${targetList}`);

    // Buscar contacto en Brevo
    const searchRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'GET',
        headers: { 'api-key': BREVO_KEY }
      }
    );

    if (!searchRes.ok) {
      console.log('Contact not found in Brevo — creating new contact:', email);
      // Si no existe el contacto, lo creamos directamente en la lista correcta
      await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_KEY
        },
        body: JSON.stringify({
          email,
          listIds: [targetList],
          updateEnabled: true
        })
      });
      return res.status(200).json({ received: true, action: 'contact_created', email, list: targetList });
    }

    const contact = await searchRes.json();
    const currentLists = contact.listIds || [];

    // Listas de las que hay que sacarla según el tipo de compra
    let listsToRemove = [];

    if (isCompra7D) {
      // Compró el 7D — sacarla de lista de No Compradoras 7D (#13) si está ahí
      const listsToCheck = [13];
      listsToRemove = currentLists.filter(id => listsToCheck.includes(id));
    } else {
      // Compró el Workshop — sacarla de secuencias S, P, D (#7, #8, #9)
      const sequenceLists = [7, 8, 9];
      listsToRemove = currentLists.filter(id => sequenceLists.includes(id));
    }

    // Actualizar contacto en Brevo
    const updateRes = await fetch(
      `https://api.brevo.com/v3/contacts/${encodeURIComponent(email)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'api-key': BREVO_KEY
        },
        body: JSON.stringify({
          listIds: [targetList],
          unlinkListIds: listsToRemove
        })
      }
    );

    console.log('Brevo update status:', updateRes.status);

    return res.status(200).json({
      received: true,
      action: isCompra7D ? 'moved_to_compradoras_7d' : 'moved_to_compradoras_workshop',
      email,
      list: targetList,
      removedFromLists: listsToRemove
    });

  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ received: true, error: err.message });
  }
}
