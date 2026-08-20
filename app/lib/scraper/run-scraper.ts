import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getDb } from '@/lib/db';
import { syncOfficialMatchesData } from '@/lib/db/json-migrator';
import { APP_SETTINGS_META_KEY, DEFAULT_APP_SETTINGS, normalizeAppSettings } from '@/lib/settings';
import type { Match, MatchesData, AssignmentContact } from '@/types/match';
import type { MatchExtraEntity, MatchOfficialEntity } from '@/lib/db/schemas';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { activeContacts, isVisiblePublicationStatus, normalizePlanningStatus } from '@/lib/planning/p0-rules';
import { notifyContact } from '@/lib/notifications/service';

const execFileAsync = promisify(execFile);

async function getScraperMatchesUrlKey(): Promise<string> {
  try {
    const db = await getDb();
    const repo = db.getRepository('AppMeta');
    const row = await repo.findOne({ where: { key: APP_SETTINGS_META_KEY } });

    if (!row?.value) {
      return DEFAULT_APP_SETTINGS.matchesUrlKey;
    }

    const parsed = JSON.parse(row.value) as unknown;
    return normalizeAppSettings(parsed).matchesUrlKey;
  } catch {
    return DEFAULT_APP_SETTINGS.matchesUrlKey;
  }
}

function flattenMatches(data: MatchesData): Match[] {
  return Object.values(data.matches ?? {}).flat().filter((match) => Boolean(match?.id));
}

function scheduleChanged(before: Match, after: Match): boolean {
  return before.date !== after.date
    || before.time !== after.time
    || before.horaireRendezVous !== after.horaireRendezVous
    || before.details?.stadium !== after.details?.stadium
    || before.details?.address !== after.details?.address;
}

function matchContacts(extras: MatchExtras): AssignmentContact[] {
  return activeContacts([
    ...(extras.arbitreTouche ?? []),
    ...(extras.contactEncadrants ?? []),
    ...(extras.contactAccompagnateur ?? []),
  ]);
}

export async function runScraperAndPersistToDb(): Promise<{ stdout: string; stderr: string }> {
  const scraperPath = path.join(process.cwd(), 'scraper.js');
  const matchesUrlKey = await getScraperMatchesUrlKey();

  const { stdout, stderr } = await execFileAsync(process.execPath, [scraperPath], {
    cwd: process.cwd(),
    timeout: 120000,
    env: {
      ...process.env,
      SCRAPER_MATCHES_URL_KEY: matchesUrlKey,
    },
  });

  const matchesFilePath = path.join(process.cwd(), 'matches.json');
  if (!fs.existsSync(matchesFilePath)) {
    throw new Error('Le scraper a terminé sans générer matches.json');
  }

  try {
    const content = fs.readFileSync(matchesFilePath, 'utf8');
    const parsed = JSON.parse(content) as MatchesData;
    const incomingMatches = flattenMatches(parsed);

    const db = await getDb();
    const officialRepo = db.getRepository<MatchOfficialEntity>('MatchOfficial');
    const extraRepo = db.getRepository<MatchExtraEntity>('MatchExtra');
    const existingRows = await officialRepo.find();
    const existingById = new Map(existingRows.map((row) => [row.id, row.payload as unknown as Match]));

    await syncOfficialMatchesData(db, parsed);

    for (const match of incomingMatches) {
      if (!match.id) continue;
      const previous = existingById.get(match.id);
      const extraRow = await extraRepo.findOneBy({ matchId: match.id });
      const extras: MatchExtras = extraRow
        ? (extraRow.payload as unknown as MatchExtras)
        : { id: match.id };

      if (!previous) {
        await extraRepo.save({
          matchId: match.id,
          payload: {
            ...extras,
            id: match.id,
            planningStatus: 'draft',
          } as unknown as Record<string, unknown>,
        });
        continue;
      }

      if (!scheduleChanged(previous, match)) continue;
      const status = normalizePlanningStatus(extras.planningStatus);
      if (!isVisiblePublicationStatus(status)) continue;

      const nextExtras: MatchExtras = {
        ...extras,
        planningStatus: 'modified',
        modifiedAfterPublishAt: new Date().toISOString(),
      };
      await extraRepo.save({
        matchId: match.id,
        payload: nextExtras as unknown as Record<string, unknown>,
      });

      await Promise.all(matchContacts(nextExtras).map((contact) => notifyContact(db, contact, {
        type: 'event-updated',
        title: 'Match officiel modifié',
        message: `${match.localTeam} – ${match.awayTeam} : ${match.date} à ${match.time}${match.details?.stadium ? `, ${match.details.stadium}` : ''}.`,
        eventType: 'officiel',
        eventId: match.id,
      })));
    }

    return { stdout, stderr };
  } finally {
    if (fs.existsSync(matchesFilePath)) fs.unlinkSync(matchesFilePath);
  }
}
