import { NextRequest, NextResponse } from 'next/server';
import { runScraperAndPersistToDb } from '@/lib/scraper/run-scraper';
import { getDb } from '@/lib/db';
import { planningFeatureGuard } from '@/lib/planning/feature-guard';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { listScraperRuns } from '@/lib/scraper/runs';

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['superadmin']);
  if ('error' in auth) return auth.error;
  const db = await getDb();
  return NextResponse.json({ runs: await listScraperRuns(db) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const disabled = await planningFeatureGuard(await getDb(), 'scraperSync');
    if (disabled) return disabled;
    const { runId, stderr, sync } = await runScraperAndPersistToDb();

    if (stderr && !stderr.includes('✅')) {
      console.error('Scraper stderr:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: 'Scraping completed successfully',
      runId,
      sync,
    });
  } catch (error) {
    console.error('Error running scraper:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to run scraper', details: errorMessage },
      { status: 500 }
    );
  }
}
