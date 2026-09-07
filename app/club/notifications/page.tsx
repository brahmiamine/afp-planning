'use client';

import { NotificationsView } from '@/app/components/notifications/NotificationsView';

// Wrapper espace club : la logique vit dans NotificationsView (issue #93).
export default function NotificationsPage() {
  return (
    <div className="max-w-5xl">
      <NotificationsView />
    </div>
  );
}
