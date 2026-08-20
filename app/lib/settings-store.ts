import type { DataSource } from 'typeorm';
import {
  APP_SETTINGS_META_KEY,
  DEFAULT_APP_SETTINGS,
  normalizeAppSettings,
  type AppSettings,
  type PlanningFeatureFlags,
} from './settings';

export async function readAppSettings(db: DataSource): Promise<AppSettings> {
  const row = await db.getRepository('AppMeta').findOne({ where: { key: APP_SETTINGS_META_KEY } });
  if (!row?.value) return DEFAULT_APP_SETTINGS;
  try {
    return normalizeAppSettings(JSON.parse(row.value) as unknown);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(db: DataSource, input: unknown): Promise<AppSettings> {
  const settings = normalizeAppSettings(input);
  await db.getRepository('AppMeta').save({
    key: APP_SETTINGS_META_KEY,
    value: JSON.stringify(settings),
  });
  return settings;
}

export async function updateAppSettings(
  db: DataSource,
  update: (current: AppSettings) => unknown,
): Promise<AppSettings> {
  return db.transaction(async (manager) => {
    const repo = manager.getRepository('AppMeta');
    const row = await repo.findOne({
      where: { key: APP_SETTINGS_META_KEY },
      lock: { mode: 'pessimistic_write' },
    });
    let current = DEFAULT_APP_SETTINGS;
    if (row?.value) {
      try {
        current = normalizeAppSettings(JSON.parse(row.value) as unknown);
      } catch {
        current = DEFAULT_APP_SETTINGS;
      }
    }
    const settings = normalizeAppSettings(update(current));
    await repo.save({ key: APP_SETTINGS_META_KEY, value: JSON.stringify(settings) });
    return settings;
  });
}

export async function isPlanningFeatureEnabled(
  db: DataSource,
  feature: keyof PlanningFeatureFlags,
): Promise<boolean> {
  return (await readAppSettings(db)).features[feature];
}

export class PlanningFeatureDisabledError extends Error {
  constructor(public readonly feature: keyof PlanningFeatureFlags) {
    super(`La fonctionnalité « ${feature} » est désactivée par le Super Admin.`);
    this.name = 'PlanningFeatureDisabledError';
  }
}

export async function requirePlanningFeature(
  db: DataSource,
  feature: keyof PlanningFeatureFlags,
): Promise<void> {
  if (!(await isPlanningFeatureEnabled(db, feature))) {
    throw new PlanningFeatureDisabledError(feature);
  }
}
