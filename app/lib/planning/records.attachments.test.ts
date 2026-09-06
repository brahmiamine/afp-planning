import { describe, expect, it, vi } from 'vitest';
import type { DataSource } from 'typeorm';
import { getPlanningAttachment } from './records';

describe('getPlanningAttachment', () => {
  it('retourne le contenu binaire réellement stocké (issue #91)', async () => {
    const expected = Buffer.from('document-binaire');
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('information_schema.columns')) return [{ present: 1 }];
      if (sql.includes('FROM planning_attachments')) {
        const row = {
          id: 'att-1',
          clubId: 'afp',
          eventType: 'amical',
          eventId: 'match-1',
          fileName: 'preuve.txt',
          mimeType: 'text/plain',
          sizeBytes: expected.length,
          uploadedByUserId: 1,
          createdAt: '2026-09-06T20:00:00.000Z',
        };
        return /\bcontent\b/i.test(sql) ? [{ ...row, content: expected }] : [row];
      }
      return [];
    });
    const db = { query } as unknown as DataSource;

    const attachment = await getPlanningAttachment(db, 'att-1');

    expect(attachment).not.toBeNull();
    expect(attachment?.content).toEqual(expected);
  });
});
