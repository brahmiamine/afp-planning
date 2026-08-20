import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
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

let tableReady = false;

async function ensureChatAttachmentsTable(db: DataSource): Promise<void> {
  if (tableReady) return;
  await db.query(`
    CREATE TABLE IF NOT EXISTS chat_attachments (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      club_id VARCHAR(64) NOT NULL,
      room_id VARCHAR(64) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(128) NOT NULL,
      size_bytes INT UNSIGNED NOT NULL,
      content LONGBLOB NOT NULL,
      uploaded_by_user_id INT NOT NULL,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      INDEX idx_chat_attachments_room (room_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tableReady = true;
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
  db: DataSource,
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
  await ensureChatAttachmentsTable(db);
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

export async function getChatAttachment(db: DataSource, id: string): Promise<ChatAttachmentRecord | null> {
  await ensureChatAttachmentsTable(db);
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
