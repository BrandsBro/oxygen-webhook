import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { createClient } from '@supabase/supabase-js';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const store = searchParams.get('store') || 'Unknown Store';
    const event = searchParams.get('event') || 'order_created';

    const body = await request.json();

    const order = {
      id: String(body.id),
      order_number: String(body.order_number),
      customer: ((body.customer?.first_name || '') + ' ' + (body.customer?.last_name || '')).trim(),
      total: body.total_price,
      currency: body.currency || 'USD',
      store,
      tracking_added: event === 'order_fulfilled',
      event,
    };

    // Upsert order to Supabase
    if (event === 'order_fulfilled') {
      await supabase
        .from('orders')
        .update({ tracking_added: true, event: 'order_fulfilled' })
        .eq('id', order.id);
    } else {
      await supabase
        .from('orders')
        .upsert(order);
    }

    // Get latest FCM token
    const { data: tokenData } = await supabase
      .from('fcm_tokens')
      .select('token')
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (!tokenData) {
      return Response.json({ error: 'No FCM token found' }, { status: 500 });
    }

    const title = event === 'order_fulfilled'
      ? `📦 Tracking Added #${order.order_number} — ${store}`
      : `🛒 New Order #${order.order_number} — ${store}`;

    await getMessaging().send({
      token: tokenData.token,
      notification: {
        title,
        body: `${order.customer} · ${order.currency} ${order.total}`,
      },
      data: {
        orderId: order.id,
        orderNumber: order.order_number,
        customer: order.customer,
        total: String(order.total),
        currency: order.currency,
        store,
        event,
        trackingAdded: String(order.tracking_added),
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
