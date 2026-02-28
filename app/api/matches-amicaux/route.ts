import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MatchesAmicauxData, Match } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const rows = await repo.find();
    const matches = rows
      .map((row) => row.payload as unknown as Match)
      .filter((item) => Boolean(item?.id));
    const matchesData: MatchesAmicauxData = {
      matches: groupMatchesByDate(matches),
    };

    return NextResponse.json(matchesData);
  } catch (error) {
    console.error('Error reading matches amicaux from DB:', error);
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

    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    await repo.save({
      id: match.id,
      date: match.date,
      time: match.time || '',
      payload: match as unknown as Record<string, unknown>,
    });

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

    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id });

    if (!row) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    const currentPayload = row.payload as unknown as Match;
    const nextPayload: Match = {
      ...currentPayload,
      ...updatedMatch,
      id,
      date: date || currentPayload.date,
      type: 'amical',
    };

    await repo.save({
      id,
      date: nextPayload.date,
      time: nextPayload.time || '',
      payload: nextPayload as unknown as Record<string, unknown>,
    });

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

    const db = await getDb();
    const repo = db.getRepository('MatchAmical');
    const row = await repo.findOneBy({ id });

    if (!row) {
      return NextResponse.json({ error: 'Match not found' }, { status: 404 });
    }

    await repo.remove(row);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting match amical:', error);
    return NextResponse.json(
      { error: 'Failed to delete match amical' },
      { status: 500 }
    );
  }
}
