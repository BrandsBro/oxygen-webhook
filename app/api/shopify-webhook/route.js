import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

export async function POST(request) {
  try {
    const body = await request.json();

    const order = {
      id: body.id,
      orderNumber: body.order_number,
      customer: body.customer?.first_name + ' ' + body.customer?.last_name,
      total: body.total_price,
      trackingAdded: body.fulfillments?.length > 0,
    };

    await getMessaging().send({
      token: process.env.FCM_TOKEN,
      notification: {
        title: `🛒 New Order #${order.orderNumber}`,
        body: `${order.customer} — $${order.total}`,
      },
      data: {
        orderId: String(order.id),
        trackingAdded: String(order.trackingAdded),
      },
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
