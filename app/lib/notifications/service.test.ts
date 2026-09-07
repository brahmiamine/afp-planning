import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { DataSource } from 'typeorm';
import type { UserEntity } from '@/lib/db/schemas';

let preferenceRecord: { payload: unknown } | null = null;
const saveNotification = vi.fn(async (..._args: unknown[]) => undefined);
const triggerPushForUser = vi.fn(async (..._args: unknown[]) => undefined);
const sendEmail = vi.fn(async (..._args: unknown[]) => undefined);
const sendWhatsAppNotification = vi.fn(async (..._args: unknown[]) => undefined);
const enqueueNotificationDelivery = vi.fn(async (_db: unknown, input: Record<string, unknown>) => ({ ...input, id: 'outbox-1', attempts: 0 }));
const markNotificationSent = vi.fn(async (..._args: unknown[]) => undefined);
const markNotificationFailed = vi.fn(async (..._args: unknown[]) => undefined);

vi.mock('@/lib/planning/records', () => ({
  getPlanningRecord: vi.fn(async () => preferenceRecord),
}));
vi.mock('@/lib/push/service', () => ({
  triggerPushForUser: (...args: unknown[]) => triggerPushForUser(...args),
}));
vi.mock('./email', () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
}));
vi.mock('./whatsapp', () => ({
  sendWhatsAppNotification: (...args: unknown[]) => sendWhatsAppNotification(...args),
}));
vi.mock('./outbox', () => ({
  enqueueNotificationDelivery: (...args: unknown[]) => enqueueNotificationDelivery(...(args as [unknown, Record<string, unknown>])),
  markNotificationSent: (...args: unknown[]) => markNotificationSent(...args),
  markNotificationFailed: (...args: unknown[]) => markNotificationFailed(...args),
}));
vi.mock('@/lib/auth/club-context', () => ({
  getCurrentClubId: () => 'afp',
}));

import { createNotificationForUser } from './service';

function fakeDb(): DataSource {
  return {
    getRepository: () => ({ save: saveNotification }),
  } as unknown as DataSource;
}

function fakeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 1,
    clubId: 'afp',
    email: 'user@example.com',
    nom: 'Test',
    roles: ['arbitre'],
    active: true,
    notifyChannel: 'email',
    ...overrides,
  } as UserEntity;
}

describe('createNotificationForUser', () => {
  beforeEach(() => {
    preferenceRecord = null;
    saveNotification.mockClear();
    triggerPushForUser.mockClear();
    sendEmail.mockClear();
    sendWhatsAppNotification.mockClear();
    enqueueNotificationDelivery.mockClear();
  });

  it('creates the in-app notification and enqueues push even when user.notifyChannel is "email"', async () => {
    // Régression #162 : notifyChannel ne doit plus être un second filtre au-dessus des
    // préférences granulaires (préférences par défaut : inApp/push/email actifs).
    const db = fakeDb();
    const user = fakeUser({ notifyChannel: 'email' });

    await createNotificationForUser(db, user, { type: 'assignment', title: 'Affectation', message: 'Vous êtes affecté' });

    expect(saveNotification).toHaveBeenCalledTimes(1);
    const pushCalls = enqueueNotificationDelivery.mock.calls.filter(([, input]) => (input as { channel: string }).channel === 'push');
    expect(pushCalls).toHaveLength(1);
    const emailCalls = enqueueNotificationDelivery.mock.calls.filter(([, input]) => (input as { channel: string }).channel === 'email');
    expect(emailCalls).toHaveLength(1);
  });

  it('respects an explicit granular preference disabling in-app and push', async () => {
    preferenceRecord = { payload: { inApp: false, push: false, email: true, whatsapp: false } };
    const db = fakeDb();
    const user = fakeUser({ notifyChannel: 'push' });

    await createNotificationForUser(db, user, { type: 'assignment', title: 'Affectation', message: 'Vous êtes affecté' });

    expect(saveNotification).not.toHaveBeenCalled();
    const pushCalls = enqueueNotificationDelivery.mock.calls.filter(([, input]) => (input as { channel: string }).channel === 'push');
    expect(pushCalls).toHaveLength(0);
    const emailCalls = enqueueNotificationDelivery.mock.calls.filter(([, input]) => (input as { channel: string }).channel === 'email');
    expect(emailCalls).toHaveLength(1);
  });
});
