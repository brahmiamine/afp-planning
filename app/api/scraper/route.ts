import { NextRequest, NextResponse } from 'next/server';
import { runScraperAndPersistToDb } from '@/lib/scraper/run-scraper';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const { stdout, stderr, sync } = await runScraperAndPersistToDb();

    if (stderr && !stderr.includes('✅')) {
      console.error('Scraper stderr:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: 'Scraping completed successfully',
      output: stdout,
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
