import type { DataSource } from 'typeorm';
import type { AssignmentContact, PersonType } from '@/types/match';
import type {
  AccompagnateurEntity,
  EncadrantEntity,
  NotificationEntity,
  OfficielEntity,
  UserEntity,
} from '@/lib/db/schemas';
import { isNotifyChannel, type NotifyChannel } from '@/lib/auth/session';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { triggerPushForUser } from '@/lib/push/service';
import { getPlanningRecord } from '@/lib/planning/records';
import { sendEmail } from './email';
import { sendWhatsAppNotification } from './whatsapp';
import {
  normalizeNotificationPreferences,
  selectedNotificationChannels,
  type NotificationUrgency,
} from './preferences';
import {
  enqueueNotificationDelivery,
  listDueNotificationDeliveries,
  markNotificationFailed,
  markNotificationSent,
  type NotificationOutboxItem,
  type OutboxChannel,
} from './outbox';

function channelOf(user: UserEntity): NotifyChannel {
  return isNotifyChannel(user.notifyChannel) ? user.notifyChannel : 'push';
}

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  eventType?: string | null;
  eventId?: string | null;
  urgency?: NotificationUrgency;
}

async function phoneForLinkedPerson(db: DataSource, personType: PersonType | null, personId: number | null): Promise<string | null> {
  if (!personType || personId === null) return null;
  const clubId = getCurrentClubId();
  if (personType === 'officiel') return (await db.getRepository<OfficielEntity>('Officiel').findOneBy({ id: personId, clubId }))?.telephone?.trim() || null;
  if (personType === 'encadrant') return (await db.getRepository<EncadrantEntity>('Encadrant').findOneBy({ id: personId, clubId }))?.telephone?.trim() || null;
  return (await db.getRepository<AccompagnateurEntity>('Accompagnateur').findOneBy({ id: personId, clubId }))?.telephone?.trim() || null;
}

async function phoneForUser(db: DataSource, user: UserEntity): Promise<string | null> {
  for (const link of user.personLinks ?? []) {
    const phone = await phoneForLinkedPerson(db, link.personType as PersonType, link.personId);
    if (phone) return phone;
  }
  return null;
}

async function deliverWhatsApp(db: DataSource, user: UserEntity, input: NotificationInput): Promise<void> {
  const phone = await phoneForUser(db, user);
  if (!phone) return;
  await sendWhatsAppNotification({
    to: phone,
    title: input.title,
    message: input.message,
    eventType: input.eventType ?? null,
    eventId: input.eventId ?? null,
    urgency: input.urgency ?? 'normal',
  });
}

async function deliverChannel(db: DataSource, user: UserEntity, channel: OutboxChannel, input: NotificationInput): Promise<void> {
  if (channel === 'push') return triggerPushForUser(db, user.id);
  if (channel === 'email') {
    if (!user.email) return;
    return sendEmail({ to: user.email, subject: input.title, text: input.message });
  }
  return deliverWhatsApp(db, user, input);
}

async function deliverOutboxItem(db: DataSource, user: UserEntity, item: NotificationOutboxItem): Promise<void> {
  try {
    await deliverChannel(db, user, item.channel, item);
    await markNotificationSent(db, item.id);
  } catch (error) {
    await markNotificationFailed(db, item.id, item.attempts, error);
  }
}

async function enqueueAndDeliver(
  db: DataSource,
  user: UserEntity,
  channel: OutboxChannel,
  input: NotificationInput,
): Promise<void> {
  const item = await enqueueNotificationDelivery(db, {
    userId: user.id,
    channel,
    type: input.type,
    title: input.title,
    message: input.message,
    eventType: input.eventType ?? null,
    eventId: input.eventId ?? null,
    urgency: input.urgency ?? 'normal',
  });
  await deliverOutboxItem(db, user, item);
}

export async function createNotificationForUser(
  db: DataSource,
  user: UserEntity,
  input: NotificationInput,
): Promise<void> {
  const preferenceRecord = await getPlanningRecord(db, `notification-preferences:${user.id}`);
  const preferences = normalizeNotificationPreferences(preferenceRecord?.payload);
  const selected = selectedNotificationChannels(preferences, { urgency: input.urgency, eventType: input.eventType });
  const userChannel = channelOf(user);
  const applicationEnabled = userChannel === 'push' || userChannel === 'both';
  const emailEnabled = userChannel === 'email' || userChannel === 'both';

  if (applicationEnabled && selected.includes('inApp')) {
    const repo = db.getRepository<NotificationEntity>('Notification');
    await repo.save({
      userId: user.id,
      type: input.type,
      title: input.title,
      message: input.message,
      eventType: input.eventType ?? null,
      eventId: input.eventId ?? null,
      readAt: null,
    });
  }

  await Promise.all([
    applicationEnabled && selected.includes('push') ? enqueueAndDeliver(db, user, 'push', input) : Promise.resolve(),
    emailEnabled && selected.includes('email') && user.email
      ? enqueueAndDeliver(db, user, 'email', input)
      : Promise.resolve(),
    selected.includes('whatsapp') ? enqueueAndDeliver(db, user, 'whatsapp', input) : Promise.resolve(),
  ]);
}

export async function retryPendingNotifications(db: DataSource, limit = 100): Promise<{ processed: number }> {
  const items = await listDueNotificationDeliveries(db, limit);
  const userRepo = db.getRepository<UserEntity>('User');
  for (const item of items) {
    const user = await userRepo.findOneBy({ id: item.userId });
    if (!user || !user.active) {
      await markNotificationFailed(db, item.id, 9, new Error('Utilisateur introuvable ou inactif'));
      continue;
    }
    await deliverOutboxItem(db, user, item);
  }
  return { processed: items.length };
}

export async function notifyAdmins(db: DataSource, input: NotificationInput): Promise<void> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true, clubId: getCurrentClubId() } });
  const admins = activeUsers.filter((user) => user.roles?.includes('superadmin') || user.roles?.includes('admin'));
  await Promise.all(admins.map((user) => createNotificationForUser(db, user, input)));
}

export async function findUsersForContact(db: DataSource, contact: AssignmentContact): Promise<UserEntity[]> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true, clubId: getCurrentClubId() } });
  const name = contact.nom.trim().toLowerCase();

  return activeUsers.filter((user) =>
    (user.personLinks ?? []).some((link) => {
      if (contact.personId !== undefined && contact.personType) {
        return link.personId === contact.personId && link.personType === contact.personType;
      }
      return !!name && link.personNom.trim().toLowerCase() === name;
    }),
  );
}

export async function notifyContact(db: DataSource, contact: AssignmentContact, input: NotificationInput): Promise<void> {
  const users = await findUsersForContact(db, contact);
  await Promise.all(users.map((user) => createNotificationForUser(db, user, input)));
}
