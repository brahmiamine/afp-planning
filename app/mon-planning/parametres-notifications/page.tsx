'use client';

import { useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { NotificationSettingsView } from '@/app/components/notifications/NotificationSettingsView';

// Wrapper espace personnel : la logique vit dans NotificationSettingsView (issue #93).
export default function NotificationSettingsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => setRefreshKey((key) => key + 1)} />
      <main className="container mx-auto max-w-3xl px-3 py-6 sm:px-4">
        <NotificationSettingsView refreshKey={refreshKey} />
      </main>
    </div>
  );
}
