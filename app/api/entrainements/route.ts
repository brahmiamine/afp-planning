import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { EntrainementsData, Entrainement } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    const rows = await repo.find();
    const entrainements = rows
      .map((row) => row.payload as unknown as Entrainement)
      .filter((item) => Boolean(item?.id));
    const data: EntrainementsData = {
      entrainements: groupMatchesByDate(entrainements),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading entrainements from DB:', error);
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

    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    await repo.save({
      id: newEntrainement.id,
      date: newEntrainement.date,
      time: newEntrainement.time,
      payload: newEntrainement as unknown as Record<string, unknown>,
    });

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

    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    const row = await repo.findOneBy({ id });

    if (!row) {
      return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });
    }

    const currentPayload = row.payload as unknown as Entrainement;
    const nextPayload: Entrainement = {
      ...currentPayload,
      ...updatedEntrainement,
      id,
      date: date || currentPayload.date,
      type: 'entrainement',
    };

    await repo.save({
      id,
      date: nextPayload.date,
      time: nextPayload.time,
      payload: nextPayload as unknown as Record<string, unknown>,
    });

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

    const db = await getDb();
    const repo = db.getRepository('Entrainement');
    const row = await repo.findOneBy({ id });

    if (!row) {
      return NextResponse.json({ error: 'Entrainement not found' }, { status: 404 });
    }

    await repo.remove(row);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting entrainement:', error);
    return NextResponse.json(
      { error: 'Failed to delete entrainement' },
      { status: 500 }
    );
  }
}
