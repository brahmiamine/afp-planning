import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { getCurrentClubIdOrNull } from '@/lib/auth/club-context';

export type PlanningRecordKind =
  | 'person-preference'
  | 'availability-request'
  | 'availability-response'
  | 'waitlist'
  | 'comment'
  | 'task'
  | 'post-event-report'
  | 'resource'
  | 'resource-booking'
  | 'transport'
  | 'template'
  | 'saved-filter'
  | 'notification-preferences'
  | 'public-share';

export interface PlanningRecord<T = Record<string, unknown>> {
  id: string;
  clubId: string;
  kind: PlanningRecordKind;
  eventType: string | null;
  eventId: string | null;
  ownerUserId: number | null;
  personType: string | null;
  personId: number | null;
  payload: T;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanningRecordFilter {
  /** undefined = club courant (contexte ALS ou APP_CLUB_ID) ; null = recherche explicite tous clubs confondus. */
  clubId?: string | null;
  kind?: PlanningRecordKind;
  eventType?: string;
  eventId?: string;
  ownerUserId?: number;
  personType?: string;
  personId?: number;
}

let tablesReady = false;
let tablesReadyPromise: Promise<void> | null = null;

function defaultClubId(): string {
  return getCurrentClubIdOrNull() || process.env.APP_CLUB_ID?.trim() || 'afp';
}

async function ensureColumn(db: DataSource, table: string, column: string, definition: string): Promise<boolean> {
  const rows = await db.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  ) as unknown[];
  if (rows.length > 0) return false;
  await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

export async function ensurePlanningSupportTables(db: DataSource): Promise<void> {
  if (tablesReady) return;
  if (tablesReadyPromise) return tablesReadyPromise;

  tablesReadyPromise = (async () => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS planning_records (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        kind VARCHAR(64) NOT NULL,
        event_type VARCHAR(32) NULL,
        event_id VARCHAR(191) NULL,
        owner_user_id INT NULL,
        person_type VARCHAR(32) NULL,
        person_id INT NULL,
        payload LONGTEXT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        INDEX idx_planning_records_kind (kind),
        INDEX idx_planning_records_event (event_type, event_id, kind),
        INDEX idx_planning_records_owner (owner_user_id, kind),
        INDEX idx_planning_records_person (person_type, person_id, kind)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS planning_attachments (
        id VARCHAR(64) NOT NULL PRIMARY KEY,
        event_type VARCHAR(32) NOT NULL,
        event_id VARCHAR(191) NOT NULL,
        file_name VARCHAR(255) NOT NULL,
        mime_type VARCHAR(128) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        content LONGBLOB NOT NULL,
        uploaded_by_user_id INT NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_planning_attachments_event (event_type, event_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const recordsClubAdded = await ensureColumn(db, 'planning_records', 'club_id', "VARCHAR(64) NOT NULL DEFAULT 'afp' AFTER id");
    const attachmentsClubAdded = await ensureColumn(db, 'planning_attachments', 'club_id', "VARCHAR(64) NOT NULL DEFAULT 'afp' AFTER id");
    await db.query('CREATE INDEX IF NOT EXISTS idx_planning_records_club ON planning_records (club_id, kind)');
    await db.query('CREATE INDEX IF NOT EXISTS idx_planning_attachments_club ON planning_attachments (club_id, event_type, event_id)');
    const clubId = defaultClubId();
    if (recordsClubAdded && clubId !== 'afp') await db.query('UPDATE planning_records SET club_id = ?', [clubId]);
    if (attachmentsClubAdded && clubId !== 'afp') await db.query('UPDATE planning_attachments SET club_id = ?', [clubId]);
    tablesReady = true;
  })().finally(() => {
    tablesReadyPromise = null;
  });

  return tablesReadyPromise;
}

function mapRow<T>(row: Record<string, unknown>): PlanningRecord<T> {
  let payload: T;
  try {
    payload = JSON.parse(String(row.payload ?? '{}')) as T;
  } catch {
    payload = {} as T;
  }
  return {
    id: String(row.id),
    clubId: String(row.clubId ?? defaultClubId()),
    kind: String(row.kind) as PlanningRecordKind,
    eventType: row.eventType === null || row.eventType === undefined ? null : String(row.eventType),
    eventId: row.eventId === null || row.eventId === undefined ? null : String(row.eventId),
    ownerUserId: row.ownerUserId === null || row.ownerUserId === undefined ? null : Number(row.ownerUserId),
    personType: row.personType === null || row.personType === undefined ? null : String(row.personType),
    personId: row.personId === null || row.personId === undefined ? null : Number(row.personId),
    payload,
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

export function planningRecordId(kind: PlanningRecordKind): string {
  return `${kind}:${randomUUID()}`;
}

export async function getPlanningRecord<T>(db: DataSource, id: string): Promise<PlanningRecord<T> | null> {
  await ensurePlanningSupportTables(db);
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, kind, event_type AS eventType, event_id AS eventId, owner_user_id AS ownerUserId,
            person_type AS personType, person_id AS personId, payload,
            created_at AS createdAt, updated_at AS updatedAt
       FROM planning_records WHERE id = ? AND club_id = ? LIMIT 1`,
    [id, defaultClubId()],
  )) as Record<string, unknown>[];
  return rows[0] ? mapRow<T>(rows[0]) : null;
}

export async function listPlanningRecords<T>(
  db: DataSource,
  filter: PlanningRecordFilter = {},
  limit = 250,
): Promise<PlanningRecord<T>[]> {
  await ensurePlanningSupportTables(db);
  const clauses: string[] = [];
  const params: unknown[] = [];
  // clubId omis => club courant ; clubId explicitement null => recherche tous clubs (ex: résolution d'un lien de partage public par token).
  const effectiveFilter: PlanningRecordFilter = { ...filter, clubId: filter.clubId === null ? null : (filter.clubId ?? defaultClubId()) };
  const entries: Array<[Exclude<keyof PlanningRecordFilter, 'clubId'>, string]> = [
    ['kind', 'kind'],
    ['eventType', 'event_type'],
    ['eventId', 'event_id'],
    ['ownerUserId', 'owner_user_id'],
    ['personType', 'person_type'],
    ['personId', 'person_id'],
  ];
  if (effectiveFilter.clubId !== null) {
    clauses.push('club_id = ?');
    params.push(effectiveFilter.clubId);
  }
  for (const [key, column] of entries) {
    const value = effectiveFilter[key];
    if (value !== undefined) {
      clauses.push(`${column} = ?`);
      params.push(value);
    }
  }
  const safeLimit = Math.max(1, Math.min(limit, 1000));
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, kind, event_type AS eventType, event_id AS eventId, owner_user_id AS ownerUserId,
            person_type AS personType, person_id AS personId, payload,
            created_at AS createdAt, updated_at AS updatedAt
       FROM planning_records
       ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''}
       ORDER BY created_at DESC
       LIMIT ${safeLimit}`,
    params,
  )) as Record<string, unknown>[];
  return rows.map((row) => mapRow<T>(row));
}

export async function savePlanningRecord<T>(
  db: DataSource,
  record: {
    id: string;
    clubId?: string;
    kind: PlanningRecordKind;
    eventType?: string | null;
    eventId?: string | null;
    ownerUserId?: number | null;
    personType?: string | null;
    personId?: number | null;
    payload: T;
  },
): Promise<void> {
  await ensurePlanningSupportTables(db);
  await db.query(
    `INSERT INTO planning_records
      (id, club_id, kind, event_type, event_id, owner_user_id, person_type, person_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      kind = VALUES(kind), event_type = VALUES(event_type), event_id = VALUES(event_id),
      owner_user_id = VALUES(owner_user_id), person_type = VALUES(person_type), person_id = VALUES(person_id),
      payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP(6)`,
    [
      record.id,
      record.clubId ?? defaultClubId(),
      record.kind,
      record.eventType ?? null,
      record.eventId ?? null,
      record.ownerUserId ?? null,
      record.personType ?? null,
      record.personId ?? null,
      JSON.stringify(record.payload ?? {}),
    ],
  );
}

export async function deletePlanningRecord(db: DataSource, id: string): Promise<boolean> {
  await ensurePlanningSupportTables(db);
  const result = (await db.query('DELETE FROM planning_records WHERE id = ? AND club_id = ?', [id, defaultClubId()])) as { affectedRows?: number };
  return Number(result.affectedRows ?? 0) > 0;
}

export interface PlanningAttachmentMeta {
  id: string;
  clubId: string;
  eventType: string;
  eventId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number;
  createdAt: Date;
}

export interface PlanningAttachment extends PlanningAttachmentMeta {
  content: Buffer;
}

function attachmentRow(row: Record<string, unknown>, includeContent: boolean): PlanningAttachment | PlanningAttachmentMeta {
  const base: PlanningAttachmentMeta = {
    id: String(row.id),
    clubId: String(row.clubId ?? defaultClubId()),
    eventType: String(row.eventType),
    eventId: String(row.eventId),
    fileName: String(row.fileName),
    mimeType: String(row.mimeType),
    sizeBytes: Number(row.sizeBytes),
    uploadedByUserId: Number(row.uploadedByUserId),
    createdAt: new Date(String(row.createdAt)),
  };
  return includeContent ? { ...base, content: row.content as Buffer } : base;
}

export async function savePlanningAttachment(
  db: DataSource,
  input: Omit<PlanningAttachment, 'id' | 'createdAt' | 'clubId'> & { clubId?: string },
): Promise<PlanningAttachmentMeta> {
  await ensurePlanningSupportTables(db);
  const id = randomUUID();
  await db.query(
    `INSERT INTO planning_attachments
      (id, club_id, event_type, event_id, file_name, mime_type, size_bytes, content, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.clubId ?? defaultClubId(), input.eventType, input.eventId, input.fileName, input.mimeType, input.sizeBytes, input.content, input.uploadedByUserId],
  );
  const stored = await getPlanningAttachment(db, id);
  if (!stored) throw new Error('Pièce jointe introuvable après enregistrement');
  const { content: _content, ...meta } = stored;
  return meta;
}

export async function listPlanningAttachments(
  db: DataSource,
  eventType: string,
  eventId: string,
): Promise<PlanningAttachmentMeta[]> {
  await ensurePlanningSupportTables(db);
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, event_type AS eventType, event_id AS eventId, file_name AS fileName,
            mime_type AS mimeType, size_bytes AS sizeBytes, uploaded_by_user_id AS uploadedByUserId,
            created_at AS createdAt
       FROM planning_attachments WHERE club_id = ? AND event_type = ? AND event_id = ? ORDER BY created_at DESC`,
    [defaultClubId(), eventType, eventId],
  )) as Record<string, unknown>[];
  return rows.map((row) => attachmentRow(row, false) as PlanningAttachmentMeta);
}

export async function getPlanningAttachment(db: DataSource, id: string): Promise<PlanningAttachment | null> {
  await ensurePlanningSupportTables(db);
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, event_type AS eventType, event_id AS eventId, file_name AS fileName,
            mime_type AS mimeType, size_bytes AS sizeBytes, content,
            uploaded_by_user_id AS uploadedByUserId, created_at AS createdAt
       FROM planning_attachments WHERE id = ? AND club_id = ? LIMIT 1`,
    [id, defaultClubId()],
  )) as Record<string, unknown>[];
  return rows[0] ? (attachmentRow(rows[0], true) as PlanningAttachment) : null;
}

export async function deletePlanningAttachment(db: DataSource, id: string): Promise<boolean> {
  await ensurePlanningSupportTables(db);
  const result = (await db.query('DELETE FROM planning_attachments WHERE id = ? AND club_id = ?', [id, defaultClubId()])) as { affectedRows?: number };
  return Number(result.affectedRows ?? 0) > 0;
}
