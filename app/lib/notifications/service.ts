import type { DataSource } from 'typeorm';
import type { AssignmentContact, PersonType } from '@/types/match';
import type {
  AccompagnateurEntity,
  EncadrantEntity,
  NotificationEntity,
  OfficielEntity,
  UserEntity,
} from '@/lib/db/schemas';
import { triggerPushForUser } from '@/lib/push/service';
import { getPlanningRecord } from '@/lib/planning/records';
import {
  normalizeNotificationPreferences,
  selectedNotificationChannels,
  type NotificationUrgency,
} from './preferences';

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  eventType?: string | null;
  eventId?: string | null;
  urgency?: NotificationUrgency;
}

async function deliverEmailWebhook(user: UserEntity, input: NotificationInput): Promise<void> {
  const url = process.env.NOTIFICATION_EMAIL_WEBHOOK_URL?.trim();
  if (!url || !user.email) return;
  const token = process.env.NOTIFICATION_EMAIL_WEBHOOK_TOKEN?.trim();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        to: user.email,
        subject: input.title,
        text: input.message,
        eventType: input.eventType ?? null,
        eventId: input.eventId ?? null,
        urgency: input.urgency ?? 'normal',
      }),
    });
    if (!response.ok) console.error(`Notification email webhook failed with status ${response.status}`);
  } catch (error) {
    console.error('Notification email webhook failed:', error);
  }
}

async function phoneForLinkedPerson(db: DataSource, personType: PersonType | null, personId: number | null): Promise<string | null> {
  if (!personType || personId === null) return null;
  if (personType === 'officiel') return (await db.getRepository<OfficielEntity>('Officiel').findOneBy({ id: personId }))?.telephone?.trim() || null;
  if (personType === 'encadrant') return (await db.getRepository<EncadrantEntity>('Encadrant').findOneBy({ id: personId }))?.telephone?.trim() || null;
  return (await db.getRepository<AccompagnateurEntity>('Accompagnateur').findOneBy({ id: personId }))?.telephone?.trim() || null;
}

async function deliverWhatsappWebhook(db: DataSource, user: UserEntity, input: NotificationInput): Promise<void> {
  const url = process.env.NOTIFICATION_WHATSAPP_WEBHOOK_URL?.trim();
  if (!url) return;
  const phone = await phoneForLinkedPerson(db, user.personType as PersonType | null, user.personId);
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
  const channels = selectedNotificationChannels(preferences, { urgency: input.urgency, eventType: input.eventType });

  if (channels.includes('inApp')) {
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
    channels.includes('email') ? deliverEmailWebhook(user, input) : Promise.resolve(),
    channels.includes('push') ? triggerPushForUser(db, user.id) : Promise.resolve(),
    channels.includes('whatsapp') ? deliverWhatsappWebhook(db, user, input) : Promise.resolve(),
  ]);
}

export async function notifyAdmins(db: DataSource, input: NotificationInput): Promise<void> {
  const users = await db.getRepository<UserEntity>('User').find({
    where: [
      { role: 'superadmin', active: true },
      { role: 'admin', active: true },
    ],
  });
  await Promise.all(users.map((user) => createNotificationForUser(db, user, input)));
}

export async function findUsersForContact(db: DataSource, contact: AssignmentContact): Promise<UserEntity[]> {
  const repo = db.getRepository<UserEntity>('User');
  if (contact.personId !== undefined && contact.personType) {
    return repo.find({ where: { personId: contact.personId, personType: contact.personType, active: true } });
  }
  const name = contact.nom.trim();
  if (!name) return [];
  return repo.createQueryBuilder('user')
    .where('user.active = :active', { active: true })
    .andWhere('LOWER(user.personNom) = :name', { name: name.toLowerCase() })
    .getMany();
}

export async function notifyContact(db: DataSource, contact: AssignmentContact, input: NotificationInput): Promise<void> {
  const users = await findUsersForContact(db, contact);
  await Promise.all(users.map((user) => createNotificationForUser(db, user, input)));
}
