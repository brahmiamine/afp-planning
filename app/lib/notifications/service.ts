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
import { triggerPushForUser } from '@/lib/push/service';
import { getPlanningRecord } from '@/lib/planning/records';
import { sendEmail } from './email';
import {
  normalizeNotificationPreferences,
  selectedNotificationChannels,
  type NotificationUrgency,
} from './preferences';

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
  if (personType === 'officiel') return (await db.getRepository<OfficielEntity>('Officiel').findOneBy({ id: personId }))?.telephone?.trim() || null;
  if (personType === 'encadrant') return (await db.getRepository<EncadrantEntity>('Encadrant').findOneBy({ id: personId }))?.telephone?.trim() || null;
  return (await db.getRepository<AccompagnateurEntity>('Accompagnateur').findOneBy({ id: personId }))?.telephone?.trim() || null;
}

async function phoneForUser(db: DataSource, user: UserEntity): Promise<string | null> {
  for (const link of user.personLinks ?? []) {
    const phone = await phoneForLinkedPerson(db, link.personType as PersonType, link.personId);
    if (phone) return phone;
  }
  return null;
}

async function deliverWhatsappWebhook(db: DataSource, user: UserEntity, input: NotificationInput): Promise<void> {
  const url = process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL?.trim();
  if (!url) return;
  const phone = await phoneForUser(db, user);
  if (!phone) return;
  const token = process.env.NOTIFICATION_WHATSAPP_WEBHOOK_TOKEN?.trim();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        to: phone,
        text: `${input.title}\n${input.message}`,
        eventType: input.eventType ?? null,
        eventId: input.eventId ?? null,
        urgency: input.urgency ?? 'normal',
      }),
    });
    if (!response.ok) console.error(`Notification WhatsApp webhook failed with status ${response.status}`);
  } catch (error) {
    console.error('Notification WhatsApp webhook failed:', error);
  }
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
    applicationEnabled && selected.includes('push') ? triggerPushForUser(db, user.id) : Promise.resolve(),
    emailEnabled && selected.includes('email') && user.email
      ? sendEmail({ to: user.email, subject: input.title, text: input.message })
      : Promise.resolve(),
    selected.includes('whatsapp') ? deliverWhatsappWebhook(db, user, input) : Promise.resolve(),
  ]);
}

export async function notifyAdmins(db: DataSource, input: NotificationInput): Promise<void> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true } });
  const admins = activeUsers.filter((user) => user.roles?.includes('superadmin') || user.roles?.includes('admin'));
  await Promise.all(admins.map((user) => createNotificationForUser(db, user, input)));
}

export async function findUsersForContact(db: DataSource, contact: AssignmentContact): Promise<UserEntity[]> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true } });
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
