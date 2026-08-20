import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { Match, Entrainement, Plateau, type PersonType } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { generateIcal } from '@/lib/utils/ical-export';
import { getOfficialMatchesMeta } from '@/lib/db/json-migrator';
import { isUserRole } from '@/lib/auth/roles';

type Event = Match | Entrainement | Plateau;

function isPersonType(value: string | null): value is PersonType {
  return value === 'officiel' || value === 'encadrant' || value === 'accompagnateur';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const token = resolvedParams.token;

    const db = await getDb();
    const user = await db.getRepository<UserEntity>('User').findOneBy({ icalToken: token });
    if (!user || !user.active || !isUserRole(user.role)) {
      return NextResponse.json({ error: 'Lien de calendrier invalide' }, { status: 404 });
    }

    const [officialRows, amicalRows, entrainementRows, plateauRows, extraRows, meta] = await Promise.all([
      db.getRepository('MatchOfficial').find(),
      db.getRepository('MatchAmical').find(),
      db.getRepository('Entrainement').find(),
      db.getRepository('Plateau').find(),
      db.getRepository('MatchExtra').find(),
      getOfficialMatchesMeta(db),
    ]);

    const events: Event[] = [
      ...officialRows.map((row) => row.payload as unknown as Match).filter((item) => Boolean(item?.id)),
      ...amicalRows.map((row) => row.payload as unknown as Match).filter((item) => Boolean(item?.id)),
      ...entrainementRows.map((row) => row.payload as unknown as Entrainement).filter((item) => Boolean(item?.id)),
      ...plateauRows.map((row) => row.payload as unknown as Plateau).filter((item) => Boolean(item?.id)),
    ];

    const allExtras: Record<string, MatchExtras> = {};
    for (const row of extraRows) {
      const payload = row.payload as unknown as MatchExtras;
      if (payload?.id) allExtras[payload.id] = payload;
    }

    const personalRole = user.role === 'arbitre'
      ? 'arbitre'
      : user.role === 'encadrant'
        ? 'encadrant'
        : user.role === 'accompagnateur'
          ? 'accompagnateur'
          : 'all';

    const hasPersonalLink = user.personId !== null || Boolean(user.personNom);
    const icsContent = generateIcal(
      events,
      allExtras,
      meta.club,
      hasPersonalLink
        ? {
            personNom: user.personNom ?? undefined,
            personId: user.personId ?? undefined,
            personType: isPersonType(user.personType) ? user.personType : undefined,
            role: personalRole,
          }
        : undefined,
    );

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="planning.ics"',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('Erreur GET ical feed:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
