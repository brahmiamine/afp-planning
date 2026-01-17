import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { MatchesData } from '@/types/match';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'matches.json');
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const matchesData: MatchesData = JSON.parse(fileContents);
    
    return NextResponse.json(matchesData);
  } catch (error) {
    console.error('Error reading matches.json:', error);
    return NextResponse.json(
      { error: 'Failed to load matches' },
      { status: 500 }
    );
  }
}
