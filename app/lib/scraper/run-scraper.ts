import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getDb } from '@/lib/db';
import { syncOfficialMatchesData } from '@/lib/db/json-migrator';
import { APP_SETTINGS_META_KEY, DEFAULT_APP_SETTINGS, normalizeAppSettings } from '@/lib/settings';
import { MatchesData } from '@/types/match';

const execAsync = promisify(exec);

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

export async function runScraperAndPersistToDb(): Promise<{ stdout: string; stderr: string }> {
  const scraperPath = path.join(process.cwd(), 'scraper.js');
  const matchesUrlKey = await getScraperMatchesUrlKey();

  const { stdout, stderr } = await execAsync(`node ${scraperPath}`, {
    cwd: process.cwd(),
    timeout: 120000,
    env: {
      ...process.env,
      SCRAPER_MATCHES_URL_KEY: matchesUrlKey,
    },
  });

  const matchesFilePath = path.join(process.cwd(), 'matches.json');
  const fileExists = fs.existsSync(matchesFilePath);

  if (!fileExists) {
    throw new Error('Le scraper a terminé sans générer matches.json');
  }

  const content = fs.readFileSync(matchesFilePath, 'utf8');
  const parsed = JSON.parse(content) as MatchesData;

  const db = await getDb();
  await syncOfficialMatchesData(db, parsed);

  fs.unlinkSync(matchesFilePath);

  return {
    stdout,
    stderr,
  };
}
