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

describe('POST /api/chat/upload document types (issue #265)', () => {
  beforeEach(() => {
    mocks.saveChatAttachmentWithinQuota.mockReset();
  });

  function documentUploadRequest(fileName: string, mimeType: string, content: BlobPart = 'contenu') {
    const form = new FormData();
    form.set('roomId', 'room-1');
    form.set('file', new File([content], fileName, { type: mimeType }));
    return new NextRequest('http://localhost/api/chat/upload', { method: 'POST', body: form });
  }

  it('accepts a PDF whose content matches the %PDF- signature and returns the "document" kind', async () => {
    mocks.saveChatAttachmentWithinQuota.mockResolvedValueOnce({
      id: 'attachment-pdf',
      clubId: 'club-test',
      roomId: 'room-1',
      kind: 'document',
      fileName: 'rapport.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 7,
      uploadedByUserId: 7,
      createdAt: new Date(),
    });

    const response = await POST(documentUploadRequest('rapport.pdf', 'application/pdf', '%PDF-1.7\n…'));

    expect(response.status).toBe(200);
    expect((await response.json()).attachment.type).toBe('document');
  });

  it('accepts an XLSX spreadsheet whose content matches the ZIP signature', async () => {
    mocks.saveChatAttachmentWithinQuota.mockResolvedValueOnce({
      id: 'attachment-xlsx',
      clubId: 'club-test',
      roomId: 'room-1',
      kind: 'document',
      fileName: 'convocations.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sizeBytes: 7,
      uploadedByUserId: 7,
      createdAt: new Date(),
    });

    const response = await POST(documentUploadRequest(
      'convocations.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
    ));

    expect(response.status).toBe(200);
    expect((await response.json()).attachment.type).toBe('document');
  });

  it('rejects an unsupported document type (e.g. Word) with 415', async () => {
    const result = await POST(documentUploadRequest('note.docx', 'application/msword'));

    expect(result.status).toBe(415);
    expect(mocks.saveChatAttachmentWithinQuota).not.toHaveBeenCalled();
  });

  it('rejects a PDF-labeled upload whose content does not match the PDF signature (issue #265, revue Codex)', async () => {
    const result = await POST(documentUploadRequest('rapport.pdf', 'application/pdf', 'MZ\x90\x00 not a pdf'));

    expect(result.status).toBe(415);
    expect(mocks.saveChatAttachmentWithinQuota).not.toHaveBeenCalled();
  });

  it('falls back to the file extension when the browser reports a generic MIME for a CSV, provided the content confirms it (issue #265, revue Codex)', async () => {
    mocks.saveChatAttachmentWithinQuota.mockResolvedValueOnce({
      id: 'attachment-csv',
      clubId: 'club-test',
      roomId: 'room-1',
      kind: 'document',
      fileName: 'export.csv',
      mimeType: 'text/csv',
      sizeBytes: 20,
      uploadedByUserId: 7,
      createdAt: new Date(),
    });

    const response = await POST(documentUploadRequest('export.csv', 'text/plain', 'nom,role\nAlice,admin\n'));

    expect(response.status).toBe(200);
    expect((await response.json()).attachment.type).toBe('document');
    expect(mocks.saveChatAttachmentWithinQuota).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mimeType: 'text/csv' }),
    );
  });

  it('does not fall back to the extension when the content does not confirm it (e.g. a renamed executable)', async () => {
    const result = await POST(documentUploadRequest('malware.csv', 'text/plain', new Uint8Array([0x4d, 0x5a, 0x00, 0x90])));

    expect(result.status).toBe(415);
    expect(mocks.saveChatAttachmentWithinQuota).not.toHaveBeenCalled();
  });
});
