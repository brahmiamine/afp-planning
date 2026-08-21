import { execFile } from 'child_process';
import { createHash } from 'node:crypto';
import path from 'path';
import { promisify } from 'util';
import { getDb } from '@/lib/db';
import type { ClubTenantEntity } from '@/lib/db/schemas';
import type { MatchesData, AssignmentContact } from '@/types/match';
import type { MatchExtras } from '@/hooks/useMatchExtras';
import { activeContacts } from '@/lib/planning/p0-rules';
import { notifyContact } from '@/lib/notifications/service';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { syncOfficialMatchesWithIdentityReconciliation } from './match-reconciliation';
import { parseScraperOutput } from './output';
import { failScraperRun, finishScraperRun, startScraperRun } from './runs';

const execFileAsync = promisify(execFile);
const MATCHES_URL_KEY_PATTERN = /^[a-z0-9-]{1,255}$/;

interface ScraperSourceConfig {
  matchesUrlKey: string;
  scraperClubName: string;
}

function normalizeClubIdentity(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

async function getScraperSourceConfig(clubId: string): Promise<ScraperSourceConfig> {
  const db = await getDb();
  const tenant = await db
    .getRepository<ClubTenantEntity>('ClubTenant')
    .findOneBy({ id: clubId, active: true });

  if (!tenant) {
    throw new Error('Club introuvable ou désactivé pour le scraping');
  }

  const matchesUrlKey = tenant.matchesUrlKey.trim().toLowerCase();
  if (!MATCHES_URL_KEY_PATTERN.test(matchesUrlKey)) {
    throw new Error('Source de scraping non configurée ou invalide pour ce club dans /plateforme');
  }

  return {
    matchesUrlKey,
    scraperClubName: tenant.scraperClubName.trim(),
  };
}

function assertScrapedClubIdentity(config: ScraperSourceConfig, parsed: MatchesData): void {
  if (!config.scraperClubName) return;
  const expected = normalizeClubIdentity(config.scraperClubName);
  const actual = normalizeClubIdentity(parsed.club?.name ?? '');
  if (!expected || !actual || expected !== actual) {
    throw new Error('La source de scraping ne correspond pas au club configuré par la plateforme');
  }
}

function scraperRunLockName(clubId: string): string {
  const clubDigest = createHash('sha256').update(clubId).digest('hex').slice(0, 32);
  return `afp_planning_scraper_${clubDigest}`;
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
  const db = await getDb();
  const lockRunner = db.createQueryRunner();
  const lockName = scraperRunLockName(clubId);
  let lockAcquired = false;

  await lockRunner.connect();
  try {
    const lockRows = await lockRunner.query(
      'SELECT GET_LOCK(?, 0) AS acquired',
      [lockName],
    ) as Array<{ acquired?: number | string }>;
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      throw new Error('Un scraping est déjà en cours pour ce club');
    }

    const sourceConfig = await getScraperSourceConfig(clubId);
    const runId = await startScraperRun(db, clubId);
    try {
      const { stdout, stderr } = await execFileAsync(process.execPath, [scraperPath], {
        cwd: process.cwd(),
        timeout: 120000,
        env: { ...process.env, SCRAPER_MATCHES_URL_KEY: sourceConfig.matchesUrlKey },
        maxBuffer: 20 * 1024 * 1024,
      });
      const parsed: MatchesData = parseScraperOutput(stdout);
      assertScrapedClubIdentity(sourceConfig, parsed);
      const syncResult = await syncOfficialMatchesWithIdentityReconciliation(db, parsed, clubId);

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
  } finally {
    if (lockAcquired) {
      try {
        await lockRunner.query('SELECT RELEASE_LOCK(?)', [lockName]);
      } catch (error) {
        console.error('Impossible de libérer le verrou du scraper:', error);
      }
    }
    await lockRunner.release();
  }
}
