import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import type { NotificationEntity, UserEntity } from '@/lib/db/schemas';

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  eventType?: string | null;
  eventId?: string | null;
}

async function deliverEmailWebhook(user: UserEntity, input: NotificationInput): Promise<void> {
  const url = process.env.NOTIFICATION_EMAIL_WEBHOOK_URL?.trim();
  if (!url || !user.email) return;

  const token = process.env.NOTIFICATION_EMAIL_WEBHOOK_TOKEN?.trim();
  try {
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        to: user.email,
        subject: input.title,
        text: input.message,
        eventType: input.eventType ?? null,
        eventId: input.eventId ?? null,
      }),
    });
  } catch (error) {
    console.error('Notification email webhook failed:', error);
  }
}

export async function createNotificationForUser(
  db: DataSource,
  user: UserEntity,
  input: NotificationInput,
): Promise<void> {
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

  await deliverEmailWebhook(user, input);
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

export async function findUsersForContact(
  db: DataSource,
  contact: AssignmentContact,
): Promise<UserEntity[]> {
  const repo = db.getRepository<UserEntity>('User');

  if (contact.personId !== undefined && contact.personType) {
    return repo.find({
      where: {
        personId: contact.personId,
        personType: contact.personType,
        active: true,
      },
    });
  }

  const name = contact.nom.trim();
  if (!name) return [];

  return repo
    .createQueryBuilder('user')
    .where('user.active = :active', { active: true })
    .andWhere('LOWER(user.personNom) = :name', { name: name.toLowerCase() })
    .getMany();
}

export async function notifyContact(
  db: DataSource,
  contact: AssignmentContact,
  input: NotificationInput,
): Promise<void> {
  const users = await findUsersForContact(db, contact);
  await Promise.all(users.map((user) => createNotificationForUser(db, user, input)));
}
