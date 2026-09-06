'use client';

import { NotificationSettingsView } from '@/app/components/notifications/NotificationSettingsView';

// Wrapper espace club : la logique vit dans NotificationSettingsView (issue #93).
export default function NotificationSettingsPage() {
  return (
    <div className="max-w-3xl">
      <NotificationSettingsView />
    </div>
  );
}
