import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

interface CategoriesData {
  categories: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('Categorie');
    const rows = await repo.find({ order: { value: 'ASC' } });
    const data: CategoriesData = { categories: rows.map((row) => String(row.value)) };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading categories from DB:', error);
    return NextResponse.json(
      { error: 'Failed to read categories' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
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

    const db = await getDb();
    const repo = db.getRepository('Categorie');

    const category = await repo
      .createQueryBuilder('categorie')
      .where('LOWER(categorie.value) = :oldValueNormalized', { oldValueNormalized: normalize(oldValue) })
      .getOne();

    if (!category) {
      return NextResponse.json(
        { error: 'Catégorie non trouvée' },
        { status: 404 }
      );
    }

    const duplicate = await repo
      .createQueryBuilder('categorie')
      .where('LOWER(categorie.value) = :newValueNormalized', { newValueNormalized: normalize(newValue) })
      .getOne();

    if (duplicate && duplicate.id !== category.id) {
      return NextResponse.json(
        { error: 'Cette catégorie existe déjà' },
        { status: 400 }
      );
    }

    category.value = newValue.trim();
    await repo.save(category);

    const rows = await repo.find({ order: { value: 'ASC' } });
    const data: CategoriesData = {
      categories: rows.map((row) => String(row.value)),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error updating categories in DB:', error);
    return NextResponse.json(
      { error: 'Failed to update categories' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const value = searchParams.get('value');

    if (!value || typeof value !== 'string' || value.trim() === '') {
      return NextResponse.json(
        { error: 'La valeur de la catégorie est requise' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Categorie');

    const category = await repo
      .createQueryBuilder('categorie')
      .where('LOWER(categorie.value) = :valueNormalized', { valueNormalized: normalize(value) })
      .getOne();

    if (!category) {
      return NextResponse.json(
        { error: 'Catégorie non trouvée' },
        { status: 404 }
      );
    }

    await repo.remove(category);

    const rows = await repo.find({ order: { value: 'ASC' } });
    const data: CategoriesData = {
      categories: rows.map((row) => String(row.value)),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error deleting category in DB:', error);
    return NextResponse.json(
      { error: 'Failed to delete category' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { value } = body;

    if (!value || typeof value !== 'string' || value.trim() === '') {
      return NextResponse.json(
        { error: 'La valeur de la catégorie est requise' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const repo = db.getRepository('Categorie');

    const existing = await repo
      .createQueryBuilder('categorie')
      .where('LOWER(categorie.value) = :normalizedValue', { normalizedValue: normalize(value) })
      .getOne();

    if (existing) {
      return NextResponse.json(
        { error: 'Cette catégorie existe déjà' },
        { status: 400 }
      );
    }

    await repo.save({ value: value.trim() });

    const rows = await repo.find({ order: { value: 'ASC' } });
    const data: CategoriesData = {
      categories: rows.map((row) => String(row.value)),
    };

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error adding category in DB:', error);
    return NextResponse.json(
      { error: 'Failed to add category' },
      { status: 500 }
    );
  }
}
