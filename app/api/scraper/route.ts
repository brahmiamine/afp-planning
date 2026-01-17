import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);

export async function POST() {
  try {
    const scraperPath = path.join(process.cwd(), 'scraper.js');
    
    const { stdout, stderr } = await execAsync(`node ${scraperPath}`, {
      cwd: process.cwd(),
      timeout: 120000, // 2 minutes timeout
    });

    if (stderr && !stderr.includes('✅')) {
      console.error('Scraper stderr:', stderr);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Scraping completed successfully',
      output: stdout 
    });
  } catch (error: any) {
    console.error('Error running scraper:', error);
    return NextResponse.json(
      { error: 'Failed to run scraper', details: error.message },
      { status: 500 }
    );
  }
}
