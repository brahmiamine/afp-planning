import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/require';
import { getDb } from '@/lib/db';
import { savePushSubscription, type BrowserPushSubscription } from '@/lib/push/store';

function isValidSubscription(value: unknown): value is BrowserPushSubscription {
  if (!value || typeof value !== 'object') return false;
  const subscription = value as BrowserPushSubscription;
  if (typeof subscription.endpoint !== 'string' || subscription.endpoint.length > 4096) return false;

  try {
    const endpoint = new URL(subscription.endpoint);
    if (endpoint.protocol !== 'https:') return false;
  } catch {
    return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if ('error' in auth) return auth.error;

  try {
    const subscription = (await request.json()) as unknown;
    if (!isValidSubscription(subscription)) {
      return NextResponse.json({ error: 'Abonnement push invalide' }, { status: 400 });
    }

    const db = await getDb();
    await savePushSubscription(
      db,
      auth.user.id,
      subscription,
      request.headers.get('user-agent')?.slice(0, 512) ?? null,
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unable to save push subscription:', error);
    return NextResponse.json({ error: "Impossible d'activer les notifications push" }, { status: 500 });
  }
}
