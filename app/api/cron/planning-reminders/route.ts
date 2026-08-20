import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runDuePlanningReminders } from '@/lib/planning/reminders';

function hasValidSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) return false;

  const bearerHeader = request.headers.get('authorization');
  const bearer = bearerHeader?.startsWith('Bearer ') ? bearerHeader.slice('Bearer '.length) : null;
  const query = request.nextUrl.searchParams.get('secret');
  const header = request.headers.get('x-cron-secret');
  return bearer === expectedSecret || query === expectedSecret || header === expectedSecret;
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await getDb();
    const result = await runDuePlanningReminders(db);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Planning reminders cron failed:', error);
    return NextResponse.json({ error: 'Planning reminders cron failed' }, { status: 500 });
  }
}
