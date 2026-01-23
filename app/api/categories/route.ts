import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CATEGORIES_FILE = path.join(process.cwd(), 'data', 'categories.json');

interface CategoriesData {
  categories: string[];
}

export async function GET() {
  try {
    if (!fs.existsSync(CATEGORIES_FILE)) {
      return NextResponse.json({ categories: [] });
    }

    const fileContents = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const data: CategoriesData = JSON.parse(fileContents);

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading categories:', error);
    return NextResponse.json(
      { error: 'Failed to read categories' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!fs.existsSync(CATEGORIES_FILE)) {
      return NextResponse.json(
        { error: 'Fichier categories.json non trouvé' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { oldValue, newValue } = body;

    if (!oldValue || typeof oldValue !== 'string' || oldValue.trim() === '') {
      return NextResponse.json(
        { error: 'L\'ancienne valeur est requise' },
        { status: 400 }
      );
    }

    if (!newValue || typeof newValue !== 'string' || newValue.trim() === '') {
      return NextResponse.json(
        { error: 'La nouvelle valeur est requise' },
        { status: 400 }
      );
    }

    const fileContents = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const data: CategoriesData = JSON.parse(fileContents);

    const categoryIndex = data.categories.findIndex(
      (c) => c.trim() === oldValue.trim()
    );

    if (categoryIndex === -1) {
      return NextResponse.json(
        { error: 'Catégorie non trouvée' },
        { status: 404 }
      );
    }

    // Vérifier si la nouvelle valeur existe déjà
    if (data.categories.some((c) => c.trim() === newValue.trim() && c.trim() !== oldValue.trim())) {
      return NextResponse.json(
        { error: 'Cette catégorie existe déjà' },
        { status: 400 }
      );
    }

    data.categories[categoryIndex] = newValue.trim();

    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating categories.json:', error);
    return NextResponse.json(
      { error: 'Failed to update categories' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!fs.existsSync(CATEGORIES_FILE)) {
      return NextResponse.json(
        { error: 'Fichier categories.json non trouvé' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const value = searchParams.get('value');

    if (!value || typeof value !== 'string' || value.trim() === '') {
      return NextResponse.json(
        { error: 'La valeur de la catégorie est requise' },
        { status: 400 }
      );
    }

    const fileContents = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const data: CategoriesData = JSON.parse(fileContents);

    const categoryIndex = data.categories.findIndex(
      (c) => c.trim() === value.trim()
    );

    if (categoryIndex === -1) {
      return NextResponse.json(
        { error: 'Catégorie non trouvée' },
        { status: 404 }
      );
    }

    data.categories.splice(categoryIndex, 1);

    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting category:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!fs.existsSync(CATEGORIES_FILE)) {
      return NextResponse.json(
        { error: 'Fichier categories.json non trouvé' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { value } = body;

    if (!value || typeof value !== 'string' || value.trim() === '') {
      return NextResponse.json(
        { error: 'La valeur de la catégorie est requise' },
        { status: 400 }
      );
    }

    const fileContents = fs.readFileSync(CATEGORIES_FILE, 'utf8');
    const data: CategoriesData = JSON.parse(fileContents);

    // Vérifier si la catégorie existe déjà
    if (data.categories.some((c) => c.trim() === value.trim())) {
      return NextResponse.json(
        { error: 'Cette catégorie existe déjà' },
        { status: 400 }
      );
    }

    data.categories.push(value.trim());
    data.categories.sort();

    fs.writeFileSync(CATEGORIES_FILE, JSON.stringify(data, null, 2), 'utf8');

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding category:', error);
    return NextResponse.json(
      { error: 'Failed to add category' },
      { status: 500 }
    );
  }
}
