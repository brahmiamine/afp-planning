import type { DataSource } from 'typeorm';
import { runWithClubId } from '@/lib/auth/club-context';
import type { MatchSyncNotification } from '@/lib/db/json-migrator';
import { notifyAdmins } from '@/lib/notifications/service';

function matchTitle(notification: MatchSyncNotification): string {
  const { match } = notification;
  return `${match.localTeam} vs ${match.awayTeam} (${match.date}${match.time ? ` ${match.time}` : ''})`;
}

function notificationInput(notification: MatchSyncNotification) {
  const title = matchTitle(notification);
  if (notification.type === 'updated') {
    return {
      type: 'official_match_updated',
      title: 'Match officiel modifié à la source',
      message: `${title} — le planning publié a été marqué « modifié » après une mise à jour SportCorico.`,
      eventType: 'officiel',
      eventId: notification.match.id,
      urgency: 'normal' as const,
    };
  }

  return {
    type: 'official_match_cancelled',
    title: 'Match officiel absent de la source',
    message: `${title} — le match publié a été annulé car absent du dernier scraping SportCorico.`,
    eventType: 'officiel',
    eventId: notification.match.id,
    urgency: 'important' as const,
  };
}

export async function deliverOfficialMatchSyncNotifications(
  db: DataSource,
  clubId: string,
  notifications: MatchSyncNotification[],
): Promise<void> {
  if (notifications.length === 0) return;

  await runWithClubId(clubId, async () => {
    for (const notification of notifications) {
      const input = notificationInput(notification);
      await notifyAdmins(db, input);
    }
  });
}
