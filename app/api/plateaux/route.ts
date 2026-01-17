import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { PlateauxData, Plateau } from '@/types/match';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'plateaux.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ plateaux: {} } as PlateauxData);
    }
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: PlateauxData = JSON.parse(fileContents);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading plateaux.json:', error);
    return NextResponse.json(
      { error: 'Failed to load plateaux' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const plateau: Omit<Plateau, 'id'> = await request.json();
    
    // Générer un ID unique
    const id = `plateau-${plateau.date.replace(/\//g, '-')}-${plateau.time.replace(':', '-')}-${Date.now()}`;
    
    const newPlateau: Plateau = {
      ...plateau,
      id,
      type: 'plateau',
    };
    
    const filePath = path.join(process.cwd(), 'plateaux.json');
    let data: PlateauxData = { plateaux: {} };
    
    if (fs.existsSync(filePath)) {
      const fileContents = fs.readFileSync(filePath, 'utf8');
      data = JSON.parse(fileContents);
    }
    
    // Initialiser la date si elle n'existe pas
    if (!data.plateaux[newPlateau.date]) {
      data.plateaux[newPlateau.date] = [];
    }
    
    const dateArray = data.plateaux[newPlateau.date];
    if (dateArray) {
      // Ajouter le plateau
      dateArray.push(newPlateau);
      
      // Trier par heure
      dateArray.sort((a, b) => a.time.localeCompare(b.time));
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return NextResponse.json({ success: true, plateau: newPlateau });
  } catch (error) {
    console.error('Error saving plateau:', error);
    return NextResponse.json(
      { error: 'Failed to save plateau' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { id, date, ...updatedPlateau } = await request.json();
    
    const filePath = path.join(process.cwd(), 'plateaux.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: PlateauxData = JSON.parse(fileContents);
    
    // Trouver et mettre à jour le plateau
    let found = false;
    for (const dateKey in data.plateaux) {
      const dateArray = data.plateaux[dateKey];
      if (!dateArray) continue;
      
      const index = dateArray.findIndex(p => p.id === id);
      if (index !== -1) {
        dateArray[index] = {
          ...dateArray[index],
          ...updatedPlateau,
          id,
          type: 'plateau',
        };
        
        // Si la date a changé, déplacer le plateau
        if (date && date !== dateKey) {
          if (!data.plateaux[date]) {
            data.plateaux[date] = [];
          }
          const targetArray = data.plateaux[date];
          const plateauToMove = dateArray[index];
          if (targetArray && plateauToMove) {
            targetArray.push(plateauToMove);
          }
          dateArray.splice(index, 1);
          
          // Supprimer la clé si vide
          if (dateArray.length === 0) {
            delete data.plateaux[dateKey];
          }
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });
    }
    
    // Trier par heure
    for (const dateKey in data.plateaux) {
      const dateArray = data.plateaux[dateKey];
      if (dateArray) {
        dateArray.sort((a, b) => a.time.localeCompare(b.time));
      }
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating plateau:', error);
    return NextResponse.json(
      { error: 'Failed to update plateau' },
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
    
    const filePath = path.join(process.cwd(), 'plateaux.json');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });
    }
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    const data: PlateauxData = JSON.parse(fileContents);
    
    // Trouver et supprimer le plateau
    let found = false;
    for (const dateKey in data.plateaux) {
      const dateArray = data.plateaux[dateKey];
      if (!dateArray) continue;
      
      const index = dateArray.findIndex(p => p.id === id);
      if (index !== -1) {
        dateArray.splice(index, 1);
        
        // Supprimer la clé si vide
        if (dateArray.length === 0) {
          delete data.plateaux[dateKey];
        }
        
        found = true;
        break;
      }
    }
    
    if (!found) {
      return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });
    }
    
    // Écrire dans le fichier
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plateau:', error);
    return NextResponse.json(
      { error: 'Failed to delete plateau' },
      { status: 500 }
    );
  }
}
