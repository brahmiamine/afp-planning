import type { DataSource } from 'typeorm';
import type { AssignmentContact } from '@/types/match';
import type {
  NotificationEntity,
  UserEntity,
} from '@/lib/db/schemas';
import { getCurrentClubId } from '@/lib/auth/club-context';
import { isClubTenantActive } from '@/lib/db/club-tenants';
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

export interface NotificationInput {
  type: string;
  title: string;
  message: string;
  eventType?: string | null;
  eventId?: string | null;
  urgency?: NotificationUrgency;
}

async function deliverWhatsApp(_db: DataSource, user: UserEntity, input: NotificationInput): Promise<void> {
  const phone = user.telephone?.trim() || null;
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
    return sendEmail({ to: user.email, subject: input.title, text: input.message, clubId: user.clubId });
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

  if (selected.includes('inApp')) {
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
    selected.includes('push') ? enqueueAndDeliver(db, user, 'push', input) : Promise.resolve(),
    selected.includes('email') && user.email ? enqueueAndDeliver(db, user, 'email', input) : Promise.resolve(),
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
    // Un club désactivé (issue #215) coupe immédiatement ses notifications en attente,
    // y compris celles déjà en file suite à un échec temporaire : on les abandonne (attempts=9
    // force le statut "dead", cf. markNotificationFailed) plutôt que de les retenter indéfiniment.
    if (!(await isClubTenantActive(db, user.clubId))) {
      await markNotificationFailed(db, item.id, 9, new Error('Club désactivé'));
      continue;
    }
    await deliverOutboxItem(db, user, item);
  }
  return { processed: items.length };
}

export async function notifyAdmins(db: DataSource, input: NotificationInput): Promise<void> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true, clubId: getCurrentClubId() } });
  const admins = activeUsers.filter((user) => user.roles?.includes('admin'));
  await Promise.all(admins.map((user) => createNotificationForUser(db, user, input)));
}

export async function findUsersForContact(db: DataSource, contact: AssignmentContact): Promise<UserEntity[]> {
  const activeUsers = await db.getRepository<UserEntity>('User').find({ where: { active: true, clubId: getCurrentClubId() } });

  if (contact.personId !== undefined && contact.personType) {
    return activeUsers.filter((user) => user.id === contact.personId);
  }

  const name = contact.nom.trim().toLowerCase();
  if (!name) return [];
  return activeUsers.filter((user) => user.nom.trim().toLowerCase() === name);
}

export async function notifyContact(db: DataSource, contact: AssignmentContact, input: NotificationInput): Promise<void> {
  const users = await findUsersForContact(db, contact);
  await Promise.all(users.map((user) => createNotificationForUser(db, user, input)));
}
