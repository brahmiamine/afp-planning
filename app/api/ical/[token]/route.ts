import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { UserEntity } from '@/lib/db/schemas';
import { Match, Entrainement, Plateau } from '@/types/match';
import { MatchExtras } from '@/hooks/useMatchExtras';
import { generateIcal } from '@/lib/utils/ical-export';
import { getOfficialMatchesMeta } from '@/lib/db/json-migrator';

type Event = Match | Entrainement | Plateau;

// GET: public — this feed is polled directly by calendar apps (Google/Apple/Outlook),
// so it can't require the session cookie. Security is the unguessable icalToken itself.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> | { token: string } }
) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const token = resolvedParams.token;

    const db = await getDb();
    const userRepo = db.getRepository<UserEntity>('User');
    const user = await userRepo.findOneBy({ icalToken: token });

    if (!user || !user.active) {
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
      ...officialRows.map((row) => row.payload as unknown as Match).filter((m) => Boolean(m?.id)),
      ...amicalRows.map((row) => row.payload as unknown as Match).filter((m) => Boolean(m?.id)),
      ...entrainementRows.map((row) => row.payload as unknown as Entrainement).filter((e) => Boolean(e?.id)),
      ...plateauRows.map((row) => row.payload as unknown as Plateau).filter((p) => Boolean(p?.id)),
    ];

    const allExtras: Record<string, MatchExtras> = {};
    for (const row of extraRows) {
      const payload = row.payload as unknown as MatchExtras;
      if (payload?.id) {
        allExtras[payload.id] = payload;
      }
    }

    const icsContent = generateIcal(
      events,
      allExtras,
      meta.club,
      user.personNom ? { personNom: user.personNom, role: 'all' } : undefined,
    );

    return new NextResponse(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'attachment; filename="planning.ics"',
      },
    });
  } catch (error) {
    console.error('Erreur GET ical feed:', error);
    return NextResponse.json({ error: 'Une erreur est survenue' }, { status: 500 });
  }
}
