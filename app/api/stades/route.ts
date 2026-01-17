import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export interface Stade {
  nom: string;
  adresse: string | null;
  googleMapsUrl: string;
}

export interface StadesData {
  stades: Stade[];
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'stades.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ stades: [] } as StadesData);
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: StadesData = JSON.parse(fileContents);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading stades.json:', error);
    return NextResponse.json(
      { error: 'Failed to load stades' },
      { status: 500 }
    );
  }
}
