import { describe, expect, it } from 'vitest';
import {
  assertChatUploadUsageWithinLimits,
  CHAT_UPLOAD_LIMITS,
  ChatAttachmentRateLimitError,
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
