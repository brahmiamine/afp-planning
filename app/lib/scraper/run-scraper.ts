import { execFile } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import { getDb } from '@/lib/db';
import { syncOfficialMatchesData } from '@/lib/db/json-migrator';
import { DEFAULT_APP_SETTINGS } from '@/lib/settings';
import { readAppSettings } from '@/lib/settings-store';
import type { MatchesData, AssignmentContact } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { activeContacts } from '@/lib/planning/p0-rules';
import { notifyContact } from '@/lib/notifications/service';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { parseScraperOutput } from './output';
import { failScraperRun, finishScraperRun, startScraperRun } from './runs';

const execFileAsync = promisify(execFile);

async function getScraperMatchesUrlKey(clubId: string): Promise<string> {
  try {
    const db = await getDb();
    const settings = await readAppSettings(db, clubId);
    return settings.matchesUrlKey;
  } catch {
    return DEFAULT_APP_SETTINGS.matchesUrlKey;
  }
}

function matchContacts(extras: MatchExtras): AssignmentContact[] {
  return activeContacts([
    ...(extras.arbitreTouche ?? []),
    ...(extras.contactEncadrants ?? []),
    ...(extras.contactAccompagnateur ?? []),
  ]);
}

export async function runScraperAndPersistToDb(clubId: string = getCurrentClubId()): Promise<{
  runId: string;
  stdout: string;
  stderr: string;
  sync: {
    activeCount: number;
    createdCount: number;
    missingCount: number;
    pendingMissingCount: number;
    updatedCount: number;
  };
}> {
  const scraperPath = path.join(process.cwd(), 'scraper.js');
  const matchesUrlKey = await getScraperMatchesUrlKey(clubId);
  const db = await getDb();
  const runId = await startScraperRun(db, clubId);
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [scraperPath], {
      cwd: process.cwd(),
      timeout: 120000,
      env: { ...process.env, SCRAPER_MATCHES_URL_KEY: matchesUrlKey },
      maxBuffer: 20 * 1024 * 1024,
    });
    const parsed: MatchesData = parseScraperOutput(stdout);
    const syncResult = await syncOfficialMatchesData(db, parsed, clubId);

    for (const notification of syncResult.notifications) {
      const extras = notification.extras as unknown as MatchExtras;
      const match = notification.match;
      const cancelled = notification.type === 'cancelled';
      await Promise.all(matchContacts(extras).map((contact) => notifyContact(db, contact, {
        type: cancelled ? 'event-cancelled' : 'event-updated',
        title: cancelled ? 'Match officiel retiré de la source' : 'Match officiel modifié',
        message: cancelled
          ? `${match.localTeam} – ${match.awayTeam} n’apparaît plus dans la dernière publication officielle.`
          : `${match.localTeam} – ${match.awayTeam} : ${match.date} à ${match.time}${match.details?.stadium ? `, ${match.details.stadium}` : ''}.`,
        eventType: 'officiel',
        eventId: match.id,
      })));
    }

    const sync = {
      activeCount: syncResult.activeCount,
      createdCount: syncResult.createdCount,
      missingCount: syncResult.missingCount,
      pendingMissingCount: syncResult.pendingMissingCount,
      updatedCount: syncResult.updatedCount,
    };
    await finishScraperRun(db, runId, sync);
    return {
      runId,
      stdout,
      stderr,
      sync,
    };
  } catch (error) {
    await failScraperRun(db, runId, error);
    throw error;
  }
}
