import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isDbAvailable } from '@/lib/db/test-utils';
import { POST } from './route';

const dbAvailable = await isDbAvailable();

function cronRequest(headers?: HeadersInit) {
  return new NextRequest('http://localhost/api/cron/planning-reminders', {
    method: 'POST',
    headers,
  });
}

describe.skipIf(!dbAvailable)('POST /api/cron/planning-reminders (issue #286)', () => {
  const previousSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousSecret;
  });

  it('rejects a missing or invalid secret', async () => {
    delete process.env.CRON_SECRET;
    expect((await POST(cronRequest())).status).toBe(401);

    process.env.CRON_SECRET = 'expected-secret';
    expect((await POST(cronRequest({ authorization: 'Bearer other-secret' }))).status).toBe(401);
    expect((await POST(cronRequest())).status).toBe(401);
  });

  it('runs for every active club when the bearer secret matches', async () => {
    process.env.CRON_SECRET = 'expected-secret';
    const response = await POST(cronRequest({ authorization: 'Bearer expected-secret' }));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      inspectedEvents: number;
      remindersSent: number;
      perClub: Record<string, unknown>;
    };
    expect(body.success).toBe(true);
    expect(typeof body.inspectedEvents).toBe('number');
    expect(typeof body.remindersSent).toBe('number');
    expect(body.perClub).toBeTypeOf('object');
  });
});
