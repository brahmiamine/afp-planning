import { NextResponse } from 'next/server';
import { getVapidConfig } from '@/lib/push/vapid';

export async function GET() {
  const config = getVapidConfig();
  return NextResponse.json({
    enabled: Boolean(config),
    publicKey: config?.publicKey ?? null,
  });
}
