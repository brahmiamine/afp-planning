import type { DataSource } from 'typeorm';
import { buildVapidAuthorization, getVapidConfig } from './vapid';
import {
  listPushSubscriptionsForUser,
  removePushSubscriptionByEndpoint,
} from './store';

const DEFAULT_PUSH_TTL_SECONDS = 60 * 60 * 24;

async function sendWakeUpPush(endpoint: string): Promise<Response> {
  const config = getVapidConfig();
  if (!config) {
    throw new Error('VAPID configuration is missing');
  }

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: buildVapidAuthorization(endpoint, config),
      TTL: String(DEFAULT_PUSH_TTL_SECONDS),
      Urgency: 'normal',
    },
  });
}

export async function triggerPushForUser(db: DataSource, userId: number): Promise<void> {
  if (!getVapidConfig()) return;

  try {
    const subscriptions = await listPushSubscriptionsForUser(db, userId);

    await Promise.all(
      subscriptions.map(async ({ endpoint }) => {
        try {
          const response = await sendWakeUpPush(endpoint);

          if (response.status === 404 || response.status === 410) {
            await removePushSubscriptionByEndpoint(db, endpoint);
            return;
          }

          if (!response.ok) {
            console.error(`Web push failed with status ${response.status}`);
          }
        } catch (error) {
          console.error('Web push delivery failed:', error);
        }
      }),
    );
  } catch (error) {
    console.error('Unable to trigger web push:', error);
  }
}
