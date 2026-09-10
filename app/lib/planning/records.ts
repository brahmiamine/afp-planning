import { randomUUID } from 'node:crypto';
import type { DataSource, EntityManager } from 'typeorm';
import { getCurrentClubIdOrNull } from '@/lib/auth/club-context';

type Queryable = DataSource | EntityManager;

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
  | 'notification-preferences'
  | 'public-share'
  | 'saved-filter'
  | 'event-template'
  | 'published-planning'
  | 'published-planning-history'
  | 'assignment-state-backfill';

export interface PlanningRecord<T = Record<string, unknown>> {
  id: string;
  clubId: string;
  kind: PlanningRecordKind;
  eventType: string | null;
  eventId: string | null;
  ownerUserId: number | null;
  personType: string | null;
  personId: number | null;
  /** Empreinte SHA-256 d'un jeton opaque (ex. lien de partage public, issue #277) — jamais
   * le jeton brut. Indexée, pour une résolution directe sans balayage cross-tenant. */
  tokenHash: string | null;
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

function defaultClubId(): string {
  return getCurrentClubIdOrNull() || process.env.APP_CLUB_ID?.trim() || 'afp';
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
    tokenHash: row.tokenHash === null || row.tokenHash === undefined ? null : String(row.tokenHash),
    payload,
    createdAt: new Date(String(row.createdAt)),
    updatedAt: new Date(String(row.updatedAt)),
  };
}

export function planningRecordId(kind: PlanningRecordKind): string {
  return `${kind}:${randomUUID()}`;
}

export async function getPlanningRecord<T>(db: Queryable, id: string): Promise<PlanningRecord<T> | null> {
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, kind, event_type AS eventType, event_id AS eventId, owner_user_id AS ownerUserId,
            person_type AS personType, person_id AS personId, token_hash AS tokenHash, payload,
            created_at AS createdAt, updated_at AS updatedAt
       FROM planning_records WHERE id = ? AND club_id = ? LIMIT 1`,
    [id, defaultClubId()],
  )) as Record<string, unknown>[];
  return rows[0] ? mapRow<T>(rows[0]) : null;
}

/**
 * Résout un enregistrement par l'empreinte de son jeton, sans connaître son club à
 * l'avance (issue #277) : recherche indexée directe sur `token_hash`, plutôt que de
 * balayer les enregistrements les plus récents en mémoire — un lien de partage plus
 * ancien reste ainsi résolvable quel que soit le nombre de liens plus récents émis
 * depuis, par ce club ou n'importe quel autre.
 */
export async function getPlanningRecordByTokenHash<T>(db: Queryable, tokenHash: string): Promise<PlanningRecord<T> | null> {
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, kind, event_type AS eventType, event_id AS eventId, owner_user_id AS ownerUserId,
            person_type AS personType, person_id AS personId, token_hash AS tokenHash, payload,
            created_at AS createdAt, updated_at AS updatedAt
       FROM planning_records WHERE token_hash = ? LIMIT 1`,
    [tokenHash],
  )) as Record<string, unknown>[];
  return rows[0] ? mapRow<T>(rows[0]) : null;
}

export async function listPlanningRecords<T>(
  db: Queryable,
  filter: PlanningRecordFilter = {},
  limit = 250,
): Promise<PlanningRecord<T>[]> {
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
            person_type AS personType, person_id AS personId, token_hash AS tokenHash, payload,
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
  db: Queryable,
  record: {
    id: string;
    clubId?: string;
    kind: PlanningRecordKind;
    eventType?: string | null;
    eventId?: string | null;
    ownerUserId?: number | null;
    personType?: string | null;
    personId?: number | null;
    tokenHash?: string | null;
    payload: T;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO planning_records
      (id, club_id, kind, event_type, event_id, owner_user_id, person_type, person_id, token_hash, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      kind = VALUES(kind), event_type = VALUES(event_type), event_id = VALUES(event_id),
      owner_user_id = VALUES(owner_user_id), person_type = VALUES(person_type), person_id = VALUES(person_id),
      token_hash = VALUES(token_hash), payload = VALUES(payload), updated_at = CURRENT_TIMESTAMP(6)`,
    [
      record.id,
      record.clubId ?? defaultClubId(),
      record.kind,
      record.eventType ?? null,
      record.eventId ?? null,
      record.ownerUserId ?? null,
      record.personType ?? null,
      record.personId ?? null,
      record.tokenHash ?? null,
      JSON.stringify(record.payload ?? {}),
    ],
  );
}

export async function deletePlanningRecord(db: Queryable, id: string): Promise<boolean> {
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
  db: Queryable,
  input: Omit<PlanningAttachment, 'id' | 'createdAt' | 'clubId'> & { clubId?: string },
): Promise<PlanningAttachmentMeta> {
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
  db: Queryable,
  eventType: string,
  eventId: string,
): Promise<PlanningAttachmentMeta[]> {
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, event_type AS eventType, event_id AS eventId, file_name AS fileName,
            mime_type AS mimeType, size_bytes AS sizeBytes, uploaded_by_user_id AS uploadedByUserId,
            created_at AS createdAt
       FROM planning_attachments WHERE club_id = ? AND event_type = ? AND event_id = ? ORDER BY created_at DESC`,
    [defaultClubId(), eventType, eventId],
  )) as Record<string, unknown>[];
  return rows.map((row) => attachmentRow(row, false) as PlanningAttachmentMeta);
}

export async function getPlanningAttachment(db: Queryable, id: string): Promise<PlanningAttachment | null> {
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, event_type AS eventType, event_id AS eventId, file_name AS fileName,
            mime_type AS mimeType, size_bytes AS sizeBytes, content,
            uploaded_by_user_id AS uploadedByUserId, created_at AS createdAt
       FROM planning_attachments WHERE id = ? AND club_id = ? LIMIT 1`,
    [id, defaultClubId()],
  )) as Record<string, unknown>[];
  return rows[0] ? (attachmentRow(rows[0], true) as PlanningAttachment) : null;
}

export async function deletePlanningAttachment(db: Queryable, id: string): Promise<boolean> {
  const result = (await db.query('DELETE FROM planning_attachments WHERE id = ? AND club_id = ?', [id, defaultClubId()])) as { affectedRows?: number };
  return Number(result.affectedRows ?? 0) > 0;
}
