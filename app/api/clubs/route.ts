import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export interface Club {
  nom: string;
  logo: string;
}

export interface ClubsData {
  clubs: Club[];
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'clubs.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ clubs: [] } as ClubsData);
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const clubs: Club[] = JSON.parse(fileContents);
    
    return NextResponse.json({ clubs });
  } catch (error) {
    console.error('Error reading clubs.json:', error);
    return NextResponse.json(
      { error: 'Failed to load clubs' },
      { status: 500 }
    );
  }
}
