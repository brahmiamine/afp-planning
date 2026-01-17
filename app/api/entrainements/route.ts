import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { EntrainementsData, Entrainement } from '@/types/match';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'entrainements.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ entrainements: {} } as EntrainementsData);
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: EntrainementsData = JSON.parse(fileContents);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading entrainements.json:', error);
    return NextResponse.json(
      { error: 'Failed to load entrainements' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const entrainement: Omit<Entrainement, 'id'> = await request.json();
    
    // Générer un ID unique
    const id = `entrainement-${entrainement.date.replace(/\//g, '-')}-${entrainement.time.replace(':', '-')}-${Date.now()}`;
    
    const newEntrainement: Entrainement = {
      ...entrainement,
      id,
      type: 'entrainement',
    };
    
    const filePath = path.join(process.cwd(), 'entrainements.json');
    let data: EntrainementsData = { entrainements: {} };
    
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(fileContents);
    }
    
    // Initialiser la date si elle n'existe pas
    if (!data.entrainements[newEntrainement.date]) {
      data.entrainements[newEntrainement.date] = [];
    }
    
    const dateArray = data.entrainements[newEntrainement.date];
    if (dateArray) {
      // Ajouter l'entraînement
      dateArray.push(newEntrainement);
      
      // Trier par heure
      dateArray.sort((a, b) => a.time.localeCompare(b.time));
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return NextResponse.json({ success: true, entrainement: newEntrainement });
  } catch (error) {
    console.error('Error saving entrainement:', error);
    return NextResponse.json(
      { error: 'Failed to save entrainement' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, date, ...updatedEntrainement } = await request.json();
    
    const filePath = path.join(process.cwd(), 'entrainements.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: EntrainementsData = JSON.parse(fileContents);
    
    // Trouver et mettre à jour l'entraînement
    let found = false;
    for (const dateKey in data.entrainements) {
      const dateArray = data.entrainements[dateKey];
      if (!dateArray) continue;
      
      const index = dateArray.findIndex(e => e.id === id);
      if (index !== -1) {
        dateArray[index] = {
          ...dateArray[index],
          ...updatedEntrainement,
          id,
          type: 'entrainement',
        };
        
        // Si la date a changé, déplacer l'entraînement
        if (date && date !== dateKey) {
          if (!data.entrainements[date]) {
            data.entrainements[date] = [];
          }
          const targetArray = data.entrainements[date];
          const entrainementToMove = dateArray[index];
          if (targetArray && entrainementToMove) {
            targetArray.push(entrainementToMove);
          }
          dateArray.splice(index, 1);
          
          // Supprimer la clé si vide
          if (dateArray.length === 0) {
            delete data.entrainements[dateKey];
          }
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });
    }
    
    // Trier par heure
    for (const dateKey in data.entrainements) {
      const dateArray = data.entrainements[dateKey];
      if (dateArray) {
        dateArray.sort((a, b) => a.time.localeCompare(b.time));
      }
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating entrainement:', error);
    return NextResponse.json(
      { error: 'Failed to update entrainement' },
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
    
    const filePath = path.join(process.cwd(), 'entrainements.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: EntrainementsData = JSON.parse(fileContents);
    
    // Trouver et supprimer l'entraînement
    let found = false;
    for (const dateKey in data.entrainements) {
      const dateArray = data.entrainements[dateKey];
      if (!dateArray) continue;
      
      const index = dateArray.findIndex(e => e.id === id);
      if (index !== -1) {
        dateArray.splice(index, 1);
        
        // Supprimer la clé si vide
        if (dateArray.length === 0) {
          delete data.entrainements[dateKey];
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting entrainement:', error);
    return NextResponse.json(
      { error: 'Failed to delete entrainement' },
      { status: 500 }
    );
  }
}
