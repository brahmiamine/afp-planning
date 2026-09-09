import { createHash, randomUUID } from 'node:crypto';
import type { DataSource, QueryRunner } from 'typeorm';
import type { ChatAttachmentType } from '@/lib/db/schemas';

export interface ChatAttachmentMeta {
  id: string;
  clubId: string;
  roomId: string;
  kind: ChatAttachmentType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: number;
  createdAt: Date;
}

export interface ChatAttachmentRecord extends ChatAttachmentMeta {
  content: Buffer;
}

const MIME_BY_KIND: Record<ChatAttachmentType, RegExp> = {
  image: /^image\/(jpeg|png|webp)$/,
  gif: /^image\/gif$/,
  video: /^video\/(mp4|webm|quicktime)$/,
  audio: /^audio\/(mpeg|mp4|webm|ogg|wav|m4a|x-m4a)$/,
};

const MAX_SIZE_BY_KIND: Record<ChatAttachmentType, number> = {
  image: 10 * 1024 * 1024,
  gif: 10 * 1024 * 1024,
  video: 50 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
};

export class ChatAttachmentValidationError extends Error {}

export class ChatAttachmentRateLimitError extends Error {
  constructor(message: string, public readonly retryAfterSeconds: number) {
    super(message);
    this.name = 'ChatAttachmentRateLimitError';
  }
}

export const CHAT_UPLOAD_LIMITS = {
  burstWindowSeconds: 10,
  burstCountPerUser: 5,
  hourlyWindowSeconds: 60 * 60,
  hourlyCountPerUser: 40,
  hourlyBytesPerUser: 200 * 1024 * 1024,
  hourlyCountPerClub: 400,
  hourlyBytesPerClub: 2 * 1024 * 1024 * 1024,
} as const;

interface UploadUsage {
  count: number;
  bytes: number;
}

export function assertChatUploadUsageWithinLimits(
  burst: UploadUsage,
  userHourly: UploadUsage,
  clubHourly: UploadUsage,
  incomingBytes: number,
): void {
  if (burst.count >= CHAT_UPLOAD_LIMITS.burstCountPerUser) {
    throw new ChatAttachmentRateLimitError(
      'Trop de fichiers envoyés, veuillez patienter quelques secondes',
      CHAT_UPLOAD_LIMITS.burstWindowSeconds,
    );
  }
  if (
    userHourly.count >= CHAT_UPLOAD_LIMITS.hourlyCountPerUser
    || userHourly.bytes + incomingBytes > CHAT_UPLOAD_LIMITS.hourlyBytesPerUser
  ) {
    throw new ChatAttachmentRateLimitError(
      'Quota horaire de pièces jointes atteint pour votre compte',
      CHAT_UPLOAD_LIMITS.hourlyWindowSeconds,
    );
  }
  if (
    clubHourly.count >= CHAT_UPLOAD_LIMITS.hourlyCountPerClub
    || clubHourly.bytes + incomingBytes > CHAT_UPLOAD_LIMITS.hourlyBytesPerClub
  ) {
    throw new ChatAttachmentRateLimitError(
      'Quota horaire de pièces jointes atteint pour le club',
      CHAT_UPLOAD_LIMITS.hourlyWindowSeconds,
    );
  }
}

export function attachmentKindForMime(mimeType: string): ChatAttachmentType | null {
  for (const [kind, pattern] of Object.entries(MIME_BY_KIND) as [ChatAttachmentType, RegExp][]) {
    if (pattern.test(mimeType)) return kind;
  }
  return null;
}

export function assertAttachmentWithinLimits(kind: ChatAttachmentType, sizeBytes: number): void {
  if (sizeBytes <= 0 || sizeBytes > MAX_SIZE_BY_KIND[kind]) {
    throw new ChatAttachmentValidationError(
      `Fichier trop volumineux (max ${Math.round(MAX_SIZE_BY_KIND[kind] / (1024 * 1024))} Mo pour ce type)`,
    );
  }
}

function metaFromRow(row: Record<string, unknown>): ChatAttachmentMeta {
  return {
    id: String(row.id),
    clubId: String(row.clubId),
    roomId: String(row.roomId),
    kind: String(row.kind) as ChatAttachmentType,
    fileName: String(row.fileName),
    mimeType: String(row.mimeType),
    sizeBytes: Number(row.sizeBytes),
    uploadedByUserId: Number(row.uploadedByUserId),
    createdAt: new Date(String(row.createdAt)),
  };
}

export async function saveChatAttachment(
  db: Pick<DataSource, 'query'>,
  input: {
    clubId: string;
    roomId: string;
    kind: ChatAttachmentType;
    fileName: string;
    mimeType: string;
    content: Buffer;
    uploadedByUserId: number;
  },
): Promise<ChatAttachmentMeta> {
  const id = randomUUID();
  await db.query(
    `INSERT INTO chat_attachments
      (id, club_id, room_id, kind, file_name, mime_type, size_bytes, content, uploaded_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, input.clubId, input.roomId, input.kind, input.fileName.slice(0, 200), input.mimeType, input.content.length, input.content, input.uploadedByUserId],
  );
  return {
    id,
    clubId: input.clubId,
    roomId: input.roomId,
    kind: input.kind,
    fileName: input.fileName.slice(0, 200),
    mimeType: input.mimeType,
    sizeBytes: input.content.length,
    uploadedByUserId: input.uploadedByUserId,
    createdAt: new Date(),
  };
}

function usageFromRows(rows: Array<Record<string, unknown>>): UploadUsage {
  const row = rows[0] ?? {};
  return { count: Number(row.uploadCount ?? 0), bytes: Number(row.totalBytes ?? 0) };
}

async function readUploadUsage(
  runner: Pick<QueryRunner, 'query'>,
  input: { clubId: string; uploadedByUserId: number },
): Promise<{ burst: UploadUsage; userHourly: UploadUsage; clubHourly: UploadUsage }> {
  const userUsage = async (windowSeconds: number) => usageFromRows(await runner.query(
    `SELECT COUNT(*) AS uploadCount, COALESCE(SUM(size_bytes), 0) AS totalBytes
       FROM chat_attachments
      WHERE club_id = ? AND uploaded_by_user_id = ?
        AND created_at >= TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6))`,
    [input.clubId, input.uploadedByUserId, -windowSeconds],
  ) as Array<Record<string, unknown>>);
  const [burst, userHourly, clubHourlyRows] = await Promise.all([
    userUsage(CHAT_UPLOAD_LIMITS.burstWindowSeconds),
    userUsage(CHAT_UPLOAD_LIMITS.hourlyWindowSeconds),
    runner.query(
      `SELECT COUNT(*) AS uploadCount, COALESCE(SUM(size_bytes), 0) AS totalBytes
         FROM chat_attachments
        WHERE club_id = ?
          AND created_at >= TIMESTAMPADD(SECOND, ?, CURRENT_TIMESTAMP(6))`,
      [input.clubId, -CHAT_UPLOAD_LIMITS.hourlyWindowSeconds],
    ) as Promise<Array<Record<string, unknown>>>,
  ]);
  return { burst, userHourly, clubHourly: usageFromRows(clubHourlyRows) };
}

function uploadLockName(clubId: string): string {
  return `chat-upload:${createHash('sha256').update(clubId).digest('hex').slice(0, 48)}`;
}

/**
 * Sérialise les uploads d'un club sur une connexion dédiée afin que la vérification des
 * fenêtres glissantes et l'INSERT soient atomiques, même avec plusieurs instances Next.
 */
export async function saveChatAttachmentWithinQuota(
  db: DataSource,
  input: Parameters<typeof saveChatAttachment>[1],
): Promise<ChatAttachmentMeta> {
  const runner = db.createQueryRunner();
  const lockName = uploadLockName(input.clubId);
  let lockAcquired = false;
  await runner.connect();
  try {
    const lockRows = await runner.query('SELECT GET_LOCK(?, 5) AS acquired', [lockName]) as Array<{ acquired?: unknown }>;
    lockAcquired = Number(lockRows[0]?.acquired) === 1;
    if (!lockAcquired) {
      throw new ChatAttachmentRateLimitError('Trop de fichiers sont en cours d’envoi, veuillez réessayer', 5);
    }
    await runner.startTransaction();
    const usage = await readUploadUsage(runner, input);
    assertChatUploadUsageWithinLimits(usage.burst, usage.userHourly, usage.clubHourly, input.content.length);
    const meta = await saveChatAttachment(runner, input);
    await runner.commitTransaction();
    return meta;
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw error;
  } finally {
    if (lockAcquired) await runner.query('SELECT RELEASE_LOCK(?)', [lockName]);
    await runner.release();
  }
}

export async function getChatAttachment(db: DataSource, id: string): Promise<ChatAttachmentRecord | null> {
  const rows = (await db.query(
    `SELECT id, club_id AS clubId, room_id AS roomId, kind, file_name AS fileName, mime_type AS mimeType,
            size_bytes AS sizeBytes, content, uploaded_by_user_id AS uploadedByUserId, created_at AS createdAt
       FROM chat_attachments WHERE id = ? LIMIT 1`,
    [id],
  )) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return null;
  return { ...metaFromRow(row), content: row.content as Buffer };
}
