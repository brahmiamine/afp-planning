import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { PlateauxData, Plateau } from '@/types/match';
import { groupMatchesByDate } from '@/lib/db/helpers';
import { requireRole } from '@/lib/auth/require';
import { WRITE_ROLES } from '@/lib/auth/roles';
import { logAuditEntry } from '@/lib/db/audit-log';

export async function GET() {
  try {
    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const rows = await repo.find();
    const plateaux = rows
      .map((row) => row.payload as unknown as Plateau)
      .filter((item) => Boolean(item?.id));
    const data: PlateauxData = {
      plateaux: groupMatchesByDate(plateaux),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error reading plateaux from DB:', error);
    return NextResponse.json(
      { error: 'Failed to load plateaux' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const plateau: Omit<Plateau, 'id'> = await request.json();

    // Générer un ID unique
    const id = `plateau-${plateau.date.replace(/\//g, '-')}-${plateau.time.replace(':', '-')}-${Date.now()}`;

    const newPlateau: Plateau = {
      ...plateau,
      id,
      type: 'plateau',
    };

    const db = await getDb();
    const repo = db.getRepository('Plateau');
    await repo.save({
      id: newPlateau.id,
      date: newPlateau.date,
      time: newPlateau.time,
      payload: newPlateau as unknown as Record<string, unknown>,
    });

    try {
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'Plateau',
        entityId: newPlateau.id,
        action: 'create',
        before: null,
        after: newPlateau as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.error('Erreur audit log plateau:', auditError);
    }

    return NextResponse.json({ success: true, plateau: newPlateau });
  } catch (error) {
    console.error('Error saving plateau:', error);
    return NextResponse.json(
      { error: 'Failed to save plateau' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const { id, date, ...updatedPlateau } = await request.json();

    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id });

    if (!row) {
      return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });
    }

    const currentPayload = row.payload as unknown as Plateau;
    const nextPayload: Plateau = {
      ...currentPayload,
      ...updatedPlateau,
      id,
      date: date || currentPayload.date,
      type: 'plateau',
    };

    await repo.save({
      id,
      date: nextPayload.date,
      time: nextPayload.time,
      payload: nextPayload as unknown as Record<string, unknown>,
    });

    try {
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'Plateau',
        entityId: id,
        action: 'update',
        before: currentPayload as unknown as Record<string, unknown>,
        after: nextPayload as unknown as Record<string, unknown>,
      });
    } catch (auditError) {
      console.error('Erreur audit log plateau:', auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating plateau:', error);
    return NextResponse.json(
      { error: 'Failed to update plateau' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, WRITE_ROLES);
  if ('error' in auth) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const db = await getDb();
    const repo = db.getRepository('Plateau');
    const row = await repo.findOneBy({ id });

    if (!row) {
      return NextResponse.json({ error: 'Plateau not found' }, { status: 404 });
    }

    await repo.remove(row);

    try {
      await logAuditEntry(db, {
        user: auth.user,
        entityType: 'Plateau',
        entityId: id,
        action: 'delete',
        before: row.payload as unknown as Record<string, unknown>,
        after: null,
      });
    } catch (auditError) {
      console.error('Erreur audit log plateau:', auditError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting plateau:', error);
    return NextResponse.json(
      { error: 'Failed to delete plateau' },
      { status: 500 }
    );
  }
}
