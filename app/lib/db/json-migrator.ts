import fs from 'fs';
import path from 'path';
import { DataSource } from 'typeorm';
import {
  AppMetaEntity,
  CategorieEntity,
  ClubEntity,
  EntrainementEntity,
  MatchAmicalEntity,
  MatchExtraEntity,
  MatchOfficialEntity,
  OfficielEntity,
  PlateauEntity,
  StadeEntity,
} from './schemas';
import {
  Entrainement,
  Match,
  MatchesAmicauxData,
  MatchesData,
  Plateau,
} from '@/types/match';
import { normalizeMatchesData } from './helpers';
import { normalizeIndisponibilites } from '@/lib/utils/officiel-availability';

const MIGRATION_KEY = 'json_migrated_v1';
const CLUB_INFO_KEY = 'matches_club_info';
const MATCHES_URL_KEY = 'matches_url';
const MATCHES_SCRAPED_AT_KEY = 'matches_scraped_at';

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

function readJsonFile<T>(relativePath: string, fallback: T): T {
  try {
    const absolutePath = path.join(process.cwd(), relativePath);
    if (!fs.existsSync(absolutePath)) {
      return fallback;
    }
    const content = fs.readFileSync(absolutePath, 'utf8');
    return JSON.parse(content) as T;
  } catch {
    return fallback;
  }
}

function flattenByDate<T>(input: Record<string, T[]>): T[] {
  return Object.values(input || {}).flat();
}

export async function ensureDbSchemaForAvailability(dataSource: DataSource): Promise<void> {
  const ensureTableColumn = async (tableName: 'officiels' | 'encadrants' | 'accompagnateurs') => {
    const tableExists = await dataSource.query(
      `SELECT 1 AS ok
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
       LIMIT 1`,
      [tableName],
    ) as Array<{ ok?: number }>;

    if (!Array.isArray(tableExists) || tableExists.length === 0) {
      return;
    }

    const columnInfo = await dataSource.query(
      `SELECT DATA_TYPE AS dataType
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = ?
         AND COLUMN_NAME = 'indisponibilites'
       LIMIT 1`,
      [tableName],
    ) as Array<{ dataType?: string }>;

    if (!Array.isArray(columnInfo) || columnInfo.length === 0) {
      await dataSource.query(
        `ALTER TABLE ${tableName}
         ADD COLUMN indisponibilites LONGTEXT NULL AFTER telephone`,
      );
      return;
    }

    const dataType = String(columnInfo[0]?.dataType ?? '').toLowerCase();
    const validTypes = new Set(['longtext', 'mediumtext', 'text']);

    if (!validTypes.has(dataType)) {
      await dataSource.query(
        `ALTER TABLE ${tableName}
         MODIFY COLUMN indisponibilites LONGTEXT NULL`,
      );
    }
  };

  await ensureTableColumn('officiels');
  await ensureTableColumn('encadrants');
  await ensureTableColumn('accompagnateurs');
}

export async function syncOfficialMatchesData(
  dataSource: DataSource,
  input: MatchesData,
): Promise<void> {
  const normalized = normalizeMatchesData(input);

  const officialRepo = dataSource.getRepository<MatchOfficialEntity>('MatchOfficial');
  const metaRepo = dataSource.getRepository<AppMetaEntity>('AppMeta');

  const flatMatches = Object.values(normalized.matches).flat();

  for (const match of flatMatches) {
    if (!match.id) {
      continue;
    }

    await officialRepo.save({
      id: match.id,
      date: match.date,
      time: match.time || '',
      payload: match as unknown as Record<string, unknown>,
    });
  }

  await metaRepo.save({ key: CLUB_INFO_KEY, value: JSON.stringify(normalized.club) });
  await metaRepo.save({ key: MATCHES_URL_KEY, value: normalized.url || '' });
  await metaRepo.save({ key: MATCHES_SCRAPED_AT_KEY, value: normalized.scrapedAt || new Date().toISOString() });
}

export async function ensureJsonDataMigrated(dataSource: DataSource): Promise<void> {
  const metaRepo = dataSource.getRepository<AppMetaEntity>('AppMeta');
  const migrationFlag = await metaRepo.findOne({ where: { key: MIGRATION_KEY } });

  if (migrationFlag?.value === 'true') {
    return;
  }

  const officielsRepo = dataSource.getRepository<OfficielEntity>('Officiel');
  const clubsRepo = dataSource.getRepository<ClubEntity>('Club');
  const categoriesRepo = dataSource.getRepository<CategorieEntity>('Categorie');
  const stadesRepo = dataSource.getRepository<StadeEntity>('Stade');
  const entrainementsRepo = dataSource.getRepository<EntrainementEntity>('Entrainement');
  const plateauxRepo = dataSource.getRepository<PlateauEntity>('Plateau');
  const amicauxRepo = dataSource.getRepository<MatchAmicalEntity>('MatchAmical');
  const extrasRepo = dataSource.getRepository<MatchExtraEntity>('MatchExtra');

  if ((await officielsRepo.count()) === 0) {
    const json = readJsonFile<{ officiels: Array<{ nom: string; telephone?: string; indisponibilites?: unknown[] }> }>('data/officiels.json', { officiels: [] });
    for (const officiel of json.officiels) {
      if (!officiel.nom?.trim()) {
        continue;
      }
      await officielsRepo.save({
        nom: officiel.nom.trim(),
        telephone: officiel.telephone?.trim() || null,
        indisponibilites: normalizeIndisponibilites(officiel.indisponibilites),
      });
    }
  }

  if ((await clubsRepo.count()) === 0) {
    const json = readJsonFile<Array<{ nom: string; logo: string }>>('data/clubs.json', []);
    const uniqueClubs = new Map<string, { nom: string; logo: string }>();

    for (const club of json) {
      if (!club.nom?.trim() || !club.logo?.trim()) {
        continue;
      }

      const nom = club.nom.trim();
      const logo = club.logo.trim();
      uniqueClubs.set(normalizeKey(nom), { nom, logo });
    }

    for (const club of uniqueClubs.values()) {
      await clubsRepo.save({ nom: club.nom, logo: club.logo });
    }
  }

  if ((await categoriesRepo.count()) === 0) {
    const json = readJsonFile<{ categories: string[] }>('data/categories.json', { categories: [] });
    const uniqueValues = new Map<string, string>();

    for (const value of json.categories) {
      if (!value?.trim()) {
        continue;
      }

      const normalizedValue = value.trim();
      uniqueValues.set(normalizeKey(normalizedValue), normalizedValue);
    }

    for (const uniqueValue of uniqueValues.values()) {
      await categoriesRepo.save({ value: uniqueValue });
    }
  }

  if ((await stadesRepo.count()) === 0) {
    const json = readJsonFile<{ stades: Array<{ nom: string; adresse: string | null; googleMapsUrl: string }> }>('stades.json', { stades: [] });
    for (const stade of json.stades) {
      if (!stade.nom?.trim() || !stade.googleMapsUrl?.trim()) {
        continue;
      }
      await stadesRepo.save({
        nom: stade.nom.trim(),
        adresse: stade.adresse?.trim() || null,
        googleMapsUrl: stade.googleMapsUrl.trim(),
      });
    }
  }

  if ((await entrainementsRepo.count()) === 0) {
    const json = readJsonFile<{ entrainements: Record<string, Entrainement[]> }>('entrainements.json', { entrainements: {} });
    const flattened = flattenByDate(json.entrainements);
    for (const entrainement of flattened) {
      if (!entrainement?.id) {
        continue;
      }
      await entrainementsRepo.save({
        id: entrainement.id,
        date: entrainement.date,
        time: entrainement.time || '',
        payload: entrainement as unknown as Record<string, unknown>,
      });
    }
  }

  if ((await plateauxRepo.count()) === 0) {
    const json = readJsonFile<{ plateaux: Record<string, Plateau[]> }>('plateaux.json', { plateaux: {} });
    const flattened = flattenByDate(json.plateaux);
    for (const plateau of flattened) {
      if (!plateau?.id) {
        continue;
      }
      await plateauxRepo.save({
        id: plateau.id,
        date: plateau.date,
        time: plateau.time || '',
        payload: plateau as unknown as Record<string, unknown>,
      });
    }
  }

  if ((await amicauxRepo.count()) === 0) {
    const json = readJsonFile<MatchesAmicauxData>('matches-amicaux.json', { matches: {} });
    const flattened = flattenByDate(json.matches);
    for (const match of flattened) {
      if (!match?.id) {
        continue;
      }
      await amicauxRepo.save({
        id: match.id,
        date: match.date,
        time: match.time || '',
        payload: match as unknown as Record<string, unknown>,
      });
    }
  }

  if ((await extrasRepo.count()) === 0) {
    const json = readJsonFile<Record<string, { id: string }>>('matches-extras.json', {});
    for (const [matchId, payload] of Object.entries(json)) {
      await extrasRepo.save({
        matchId,
        payload: payload as unknown as Record<string, unknown>,
      });
    }
  }

  if ((await dataSource.getRepository<MatchOfficialEntity>('MatchOfficial').count()) === 0) {
    const json = readJsonFile<MatchesData>('matches.json', {
      club: { name: 'Academie Football Paris 18', description: 'Club de Football à Paris 18', logo: '' },
      url: '',
      scrapedAt: new Date().toISOString(),
      matches: {},
    });
    const hasSomeMatch = Object.values(json.matches).some((items) => Array.isArray(items) && items.length > 0);
    if (hasSomeMatch) {
      await syncOfficialMatchesData(dataSource, json);
    } else {
      await metaRepo.save({ key: CLUB_INFO_KEY, value: JSON.stringify(json.club) });
      await metaRepo.save({ key: MATCHES_URL_KEY, value: json.url || '' });
      await metaRepo.save({ key: MATCHES_SCRAPED_AT_KEY, value: json.scrapedAt || new Date().toISOString() });
    }
  }

  await metaRepo.save({ key: MIGRATION_KEY, value: 'true' });
}

export async function getOfficialMatchesMeta(dataSource: DataSource): Promise<{
  club: { name: string; description: string; logo: string };
  url: string;
  scrapedAt: string;
}> {
  const metaRepo = dataSource.getRepository<AppMetaEntity>('AppMeta');
  const [clubMeta, urlMeta, scrapedAtMeta] = await Promise.all([
    metaRepo.findOne({ where: { key: CLUB_INFO_KEY } }),
    metaRepo.findOne({ where: { key: MATCHES_URL_KEY } }),
    metaRepo.findOne({ where: { key: MATCHES_SCRAPED_AT_KEY } }),
  ]);

  const fallbackClub = {
    name: 'Academie Football Paris 18',
    description: 'Club de Football à Paris 18',
    logo: '',
  };

  let club = fallbackClub;
  if (clubMeta?.value) {
    try {
      club = JSON.parse(clubMeta.value) as typeof fallbackClub;
    } catch {
      club = fallbackClub;
    }
  }

  return {
    club,
    url: urlMeta?.value ?? '',
    scrapedAt: scrapedAtMeta?.value ?? new Date().toISOString(),
  };
}

export function toMatchPayload(payload: Record<string, unknown>): Match {
  return payload as unknown as Match;
}
