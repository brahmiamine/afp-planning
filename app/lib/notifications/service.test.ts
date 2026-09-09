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
const listDueNotificationDeliveries = vi.fn(async (..._args: unknown[]) => [] as Array<Record<string, unknown>>);
let clubTenantActive = true;
const isClubTenantActive = vi.fn(async (..._args: unknown[]) => clubTenantActive);

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
  listDueNotificationDeliveries: (...args: unknown[]) => listDueNotificationDeliveries(...args),
}));
vi.mock('@/lib/auth/club-context', () => ({
  getCurrentClubId: () => 'afp',
}));
vi.mock('@/lib/db/club-tenants', () => ({
  isClubTenantActive: (...args: unknown[]) => isClubTenantActive(...args),
}));

import { createNotificationForUser, retryPendingNotifications } from './service';

function fakeDb(findOneBy: (...args: unknown[]) => unknown = async () => null): DataSource {
  return {
    getRepository: () => ({ save: saveNotification, findOneBy }),
  } as unknown as DataSource;
}

function fakeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: 1,
    clubId: 'afp',
    email: 'user@example.com',
    nom: 'Test',
    accessRole: 'dirigeant',
    planningFunctions: ['arbitre_club'],
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

describe('retryPendingNotifications (issue #215)', () => {
  const pendingItem = { id: 'outbox-1', userId: 1, channel: 'email' as const };

  beforeEach(() => {
    clubTenantActive = true;
    markNotificationFailed.mockClear();
    sendEmail.mockClear();
    markNotificationSent.mockClear();
    listDueNotificationDeliveries.mockClear();
    isClubTenantActive.mockClear();
    listDueNotificationDeliveries.mockResolvedValueOnce([pendingItem]);
  });

  it('abandons a due notification whose club has been disabled, without attempting delivery', async () => {
    clubTenantActive = false;
    const db = fakeDb(async () => fakeUser());

    const result = await retryPendingNotifications(db);

    expect(result.processed).toBe(1);
    expect(isClubTenantActive).toHaveBeenCalledWith(db, 'afp');
    expect(sendEmail).not.toHaveBeenCalled();
    expect(markNotificationSent).not.toHaveBeenCalled();
    expect(markNotificationFailed).toHaveBeenCalledWith(db, 'outbox-1', 9, expect.any(Error));
  });

  it('delivers a due notification when the club is active', async () => {
    clubTenantActive = true;
    const db = fakeDb(async () => fakeUser());

    await retryPendingNotifications(db);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(markNotificationSent).toHaveBeenCalledWith(db, 'outbox-1');
    expect(markNotificationFailed).not.toHaveBeenCalled();
  });

  it('still abandons for an inactive user without even checking the club', async () => {
    const db = fakeDb(async () => fakeUser({ active: false }));

    await retryPendingNotifications(db);

    expect(isClubTenantActive).not.toHaveBeenCalled();
    expect(markNotificationFailed).toHaveBeenCalledWith(db, 'outbox-1', 9, expect.any(Error));
  });
});
