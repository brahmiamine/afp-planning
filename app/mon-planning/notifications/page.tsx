'use client';

import { Header } from '@/app/components/layout/Header';
import { NotificationsView } from '@/app/components/notifications/NotificationsView';

// Wrapper espace personnel : la logique vit dans NotificationsView (issue #93).
export default function NotificationsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
        <NotificationsView layout="cards" />
      </main>
    </div>
  );
}
