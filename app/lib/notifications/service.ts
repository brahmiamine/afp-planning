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
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true } });
  const admins = activeUsers.filter((user) => user.roles?.includes('superadmin') || user.roles?.includes('admin'));

  await Promise.all(admins.map((user) => createNotificationForUser(db, user, input)));
}

export async function findUsersForContact(
  db: DataSource,
  contact: AssignmentContact,
): Promise<UserEntity[]> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true } });
  const name = contact.nom.trim().toLowerCase();

  return activeUsers.filter((user) =>
    (user.personLinks || []).some((link) => {
      if (contact.personId !== undefined && contact.personType) {
        return link.personId === contact.personId && link.personType === contact.personType;
      }
      return !!name && link.personNom.trim().toLowerCase() === name;
    }),
  );
}

export async function notifyContact(
  db: DataSource,
  contact: AssignmentContact,
  input: NotificationInput,
): Promise<void> {
  const users = await findUsersForContact(db, contact);
  await Promise.all(users.map((user) => createNotificationForUser(db, user, input)));
}
