import { describe, expect, it } from 'vitest';
import {
  assertAttachmentWithinLimits,
  assertChatUploadUsageWithinLimits,
  attachmentKindForMime,
  CHAT_UPLOAD_LIMITS,
  ChatAttachmentRateLimitError,
  ChatAttachmentValidationError,
} from './attachments';

describe('chat attachment quotas (issue #218)', () => {
  it('rejects the sixth successful upload in a ten-second window', () => {
    const attempt = () => assertChatUploadUsageWithinLimits(
      { count: CHAT_UPLOAD_LIMITS.burstCountPerUser, bytes: 5_000 },
      { count: 5, bytes: 5_000 },
      { count: 5, bytes: 5_000 },
      1_000,
    );

    expect(attempt).toThrow(ChatAttachmentRateLimitError);
    expect(attempt).toThrow('Trop de fichiers envoyés');
  });

  it('rejects user and club hourly byte quotas before inserting the BLOB', () => {
    expect(() => assertChatUploadUsageWithinLimits(
      { count: 0, bytes: 0 },
      { count: 1, bytes: CHAT_UPLOAD_LIMITS.hourlyBytesPerUser - 100 },
      { count: 1, bytes: 1_000 },
      101,
    )).toThrow('Quota horaire de pièces jointes atteint pour votre compte');

    expect(() => assertChatUploadUsageWithinLimits(
      { count: 0, bytes: 0 },
      { count: 1, bytes: 1_000 },
      { count: 1, bytes: CHAT_UPLOAD_LIMITS.hourlyBytesPerClub - 100 },
      101,
    )).toThrow('Quota horaire de pièces jointes atteint pour le club');
  });
});

describe('document attachments — PDF/Excel/CSV (issue #265)', () => {
  it('recognizes PDF, XLSX, legacy XLS and CSV as the "document" kind', () => {
    expect(attachmentKindForMime('application/pdf')).toBe('document');
    expect(attachmentKindForMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('document');
    expect(attachmentKindForMime('application/vnd.ms-excel')).toBe('document');
    expect(attachmentKindForMime('text/csv')).toBe('document');
  });

  it('still rejects unsupported document types (e.g. Word, generic octet-stream)', () => {
    expect(attachmentKindForMime('application/msword')).toBeNull();
    expect(attachmentKindForMime('application/octet-stream')).toBeNull();
  });

  it('does not regress existing image/gif/video/audio detection', () => {
    expect(attachmentKindForMime('image/png')).toBe('image');
    expect(attachmentKindForMime('image/gif')).toBe('gif');
    expect(attachmentKindForMime('video/mp4')).toBe('video');
    expect(attachmentKindForMime('audio/mpeg')).toBe('audio');
  });

  it('accepts a document within the 20 Mo limit and rejects one above it', () => {
    expect(() => assertAttachmentWithinLimits('document', 19 * 1024 * 1024)).not.toThrow();
    expect(() => assertAttachmentWithinLimits('document', 21 * 1024 * 1024)).toThrow(ChatAttachmentValidationError);
  });
});
