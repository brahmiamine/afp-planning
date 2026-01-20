import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'categories.json');
    
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ categories: [] });
    }

    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileContents);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading categories:', error);
    return NextResponse.json(
      { error: 'Failed to read categories' },
      { status: 500 }
    );
  }
}
