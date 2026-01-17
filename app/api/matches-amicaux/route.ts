import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { MatchesAmicauxData, Match } from '@/types/match';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'matches-amicaux.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ matches: {} } as MatchesAmicauxData);
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const matchesData: MatchesAmicauxData = JSON.parse(fileContents);
    
    return NextResponse.json(matchesData);
  } catch (error) {
    console.error('Error reading matches-amicaux.json:', error);
    return NextResponse.json(
      { error: 'Failed to load matches amicaux' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const match: Match = await request.json();
    
    // Générer un ID si absent
    if (!match.id) {
      match.id = `amical-${match.date.replace(/\//g, '-')}-${match.time.replace(':', '-')}-${Date.now()}`;
    }
    
    // S'assurer que le type est 'amical'
    match.type = 'amical';
    
    const filePath = path.join(process.cwd(), 'matches-amicaux.json');
    let matchesData: MatchesAmicauxData = { matches: {} };
    
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      matchesData = JSON.parse(fileContents);
    }
    
    // Initialiser la date si elle n'existe pas
    if (!matchesData.matches[match.date]) {
      matchesData.matches[match.date] = [];
    }
    
    const dateArray = matchesData.matches[match.date];
    if (dateArray) {
      // Ajouter le match
      dateArray.push(match);
      
      // Trier par heure
      dateArray.sort((a, b) => a.time.localeCompare(b.time));
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(matchesData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true, match });
  } catch (error) {
    console.error('Error saving match amical:', error);
    return NextResponse.json(
      { error: 'Failed to save match amical' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, date, ...updatedMatch } = await request.json();
    
    const filePath = path.join(process.cwd(), 'matches-amicaux.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const matchesData: MatchesAmicauxData = JSON.parse(fileContents);
    
    // Trouver et mettre à jour le match
    let found = false;
    for (const dateKey in matchesData.matches) {
      const dateArray = matchesData.matches[dateKey];
      if (!dateArray) continue;
      
      const matchIndex = dateArray.findIndex(m => m.id === id);
      if (matchIndex !== -1) {
        dateArray[matchIndex] = {
          ...dateArray[matchIndex],
          ...updatedMatch,
          id,
        };
        
        // Si la date a changé, déplacer le match
        if (date && date !== dateKey) {
          if (!matchesData.matches[date]) {
            matchesData.matches[date] = [];
          }
          const targetArray = matchesData.matches[date];
          const matchToMove = dateArray[matchIndex];
          if (targetArray && matchToMove) {
            targetArray.push(matchToMove);
          }
          dateArray.splice(matchIndex, 1);
          
          // Supprimer la clé si vide
          if (dateArray.length === 0) {
            delete matchesData.matches[dateKey];
          }
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    
    // Trier par heure
    for (const dateKey in matchesData.matches) {
      const dateArray = matchesData.matches[dateKey];
      if (dateArray) {
        dateArray.sort((a, b) => a.time.localeCompare(b.time));
      }
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(matchesData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating match amical:', error);
    return NextResponse.json(
      { error: 'Failed to update match amical' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }
    
    const filePath = path.join(process.cwd(), 'matches-amicaux.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const matchesData: MatchesAmicauxData = JSON.parse(fileContents);
    
    // Trouver et supprimer le match
    let found = false;
    for (const dateKey in matchesData.matches) {
      const dateArray = matchesData.matches[dateKey];
      if (!dateArray) continue;
      
      const matchIndex = dateArray.findIndex(m => m.id === id);
      if (matchIndex !== -1) {
        dateArray.splice(matchIndex, 1);
        
        // Supprimer la clé si vide
        if (dateArray.length === 0) {
          delete matchesData.matches[dateKey];
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(matchesData, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match amical:', error);
    return NextResponse.json(
      { error: 'Failed to delete match amical' },
      { status: 500 }
    );
  }
}
