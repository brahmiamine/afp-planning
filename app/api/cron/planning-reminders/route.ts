import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { runDuePlanningReminders } from '@/lib/planning/reminders';

function safeSecretEquals(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function hasValidSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (!expectedSecret) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const bearer = authorization.slice('Bearer '.length).trim();
  return bearer.length > 0 && safeSecretEquals(bearer, expectedSecret);
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
