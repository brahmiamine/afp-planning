export type NotificationChannel = 'inApp' | 'push' | 'email' | 'whatsapp';
export type NotificationUrgency = 'normal' | 'important' | 'critical';

export interface NotificationPreferences {
  inApp: boolean;
  push: boolean;
  email: boolean;
  whatsapp: boolean;
  urgencyThreshold: NotificationUrgency;
  eventTypes: string[];
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  inApp: true,
  push: true,
  email: true,
  whatsapp: false,
  urgencyThreshold: 'normal',
  eventTypes: [],
};

const URGENCY_RANK: Record<NotificationUrgency, number> = { normal: 0, important: 1, critical: 2 };

function isUrgency(value: unknown): value is NotificationUrgency {
  return value === 'normal' || value === 'important' || value === 'critical';
}

export function normalizeNotificationPreferences(value: unknown): NotificationPreferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_NOTIFICATION_PREFERENCES };
  const raw = value as Record<string, unknown>;
  const eventTypes = Array.isArray(raw.eventTypes)
    ? [...new Set(raw.eventTypes.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean))].slice(0, 30)
    : [];
  const inApp = raw.inApp !== false;
  return {
    inApp,
    push: inApp && raw.push !== false,
    email: raw.email !== false,
    whatsapp: raw.whatsapp === true,
    urgencyThreshold: isUrgency(raw.urgencyThreshold) ? raw.urgencyThreshold : 'normal',
    eventTypes,
  };
}

export function selectedNotificationChannels(
  preferences: NotificationPreferences,
  input: { urgency?: NotificationUrgency; eventType?: string | null },
): NotificationChannel[] {
  const channels: NotificationChannel[] = [];
  if (preferences.inApp) channels.push('inApp');
  const urgency = input.urgency ?? 'normal';
  const passesUrgency = URGENCY_RANK[urgency] >= URGENCY_RANK[preferences.urgencyThreshold];
  const passesEventType = !input.eventType || preferences.eventTypes.length === 0 || preferences.eventTypes.includes(input.eventType);
  if (!passesUrgency || !passesEventType) return channels;
  if (preferences.push) channels.push('push');
  if (preferences.email) channels.push('email');
  if (preferences.whatsapp) channels.push('whatsapp');
  return channels;
}
