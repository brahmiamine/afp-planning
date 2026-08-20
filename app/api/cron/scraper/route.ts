import { NextRequest, NextResponse } from 'next/server';
import { runScraperAndPersistToDb } from '@/lib/scraper/run-scraper';

function hasValidSecret(request: NextRequest): boolean {
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return false;
  }

  const bearerHeader = request.headers.get('authorization');
  const token = bearerHeader?.startsWith('Bearer ') ? bearerHeader.slice('Bearer '.length) : null;
  const queryToken = request.nextUrl.searchParams.get('secret');
  const headerToken = request.headers.get('x-cron-secret');

  return token === expectedSecret || queryToken === expectedSecret || headerToken === expectedSecret;
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runScraperAndPersistToDb();

    return NextResponse.json({
      success: true,
      message: 'Cron scraper executed successfully',
      output: result.stdout,
      sync: result.sync,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    return NextResponse.json(
      { error: 'Cron scraper failed', details: errorMessage },
      { status: 500 },
    );
  }
}
