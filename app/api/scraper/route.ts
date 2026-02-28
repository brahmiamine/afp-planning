import { NextResponse } from 'next/server';
import { runScraperAndPersistToDb } from '@/lib/scraper/run-scraper';

export async function POST() {
  try {
    const { stdout, stderr } = await runScraperAndPersistToDb();

    if (stderr && !stderr.includes('✅')) {
      console.error('Scraper stderr:', stderr);
    }

    return NextResponse.json({
      success: true,
      message: 'Scraping completed successfully',
      output: stdout
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
