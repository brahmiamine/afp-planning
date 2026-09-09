import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  saveChatAttachmentWithinQuota: vi.fn(),
}));

vi.mock('@/lib/auth/require', () => ({
  requireAuth: vi.fn(async () => ({ user: { id: 7, clubId: 'club-test' } })),
}));
vi.mock('@/lib/db', () => ({ getDb: vi.fn(async () => ({})) }));
vi.mock('@/lib/auth/club-context', () => ({ setCurrentClubId: vi.fn() }));
vi.mock('@/lib/chat/service', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/chat/service')>(),
  assertRoomAccess: vi.fn(async () => undefined),
}));
vi.mock('@/lib/chat/attachments', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/chat/attachments')>(),
  saveChatAttachmentWithinQuota: mocks.saveChatAttachmentWithinQuota,
}));

import { ChatAttachmentRateLimitError } from '@/lib/chat/attachments';
import { POST } from './route';

function uploadRequest(index: number) {
  const form = new FormData();
  form.set('roomId', 'room-1');
  form.set('file', new File([`image-${index}`], `image-${index}.png`, { type: 'image/png' }));
  return new NextRequest('http://localhost/api/chat/upload', { method: 'POST', body: form });
}

describe('POST /api/chat/upload rate limit (issue #218)', () => {
  beforeEach(() => {
    mocks.saveChatAttachmentWithinQuota.mockReset();
  });

  it('returns 429 and Retry-After when a burst exceeds five uploads', async () => {
    for (let index = 0; index < 5; index += 1) {
      mocks.saveChatAttachmentWithinQuota.mockResolvedValueOnce({
        id: `attachment-${index}`,
        clubId: 'club-test',
        roomId: 'room-1',
        kind: 'image',
        fileName: `image-${index}.png`,
        mimeType: 'image/png',
        sizeBytes: 7,
        uploadedByUserId: 7,
        createdAt: new Date(),
      });
    }
    mocks.saveChatAttachmentWithinQuota.mockRejectedValueOnce(
      new ChatAttachmentRateLimitError('Trop de fichiers envoyés, veuillez patienter quelques secondes', 10),
    );

    for (let index = 0; index < 5; index += 1) {
      expect((await POST(uploadRequest(index))).status).toBe(200);
    }
    const rejected = await POST(uploadRequest(5));

    expect(rejected.status).toBe(429);
    expect(rejected.headers.get('Retry-After')).toBe('10');
    expect(await rejected.json()).toEqual({ error: 'Trop de fichiers envoyés, veuillez patienter quelques secondes' });
  });
});
