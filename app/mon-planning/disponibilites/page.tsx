'use client';

import { useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { AvailabilityCampaignsView } from '@/app/components/availability/AvailabilityCampaignsView';

// Wrapper espace personnel : la logique vit dans AvailabilityCampaignsView (issue #93).
export default function AvailabilityCampaignsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => setRefreshKey((key) => key + 1)} />
      <main className="container mx-auto max-w-5xl px-3 py-6 sm:px-4">
        <AvailabilityCampaignsView mode="personal" refreshKey={refreshKey} />
      </main>
    </div>
  );
}
