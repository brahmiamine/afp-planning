'use client';

import { AvailabilityCampaignsView } from '@/app/components/availability/AvailabilityCampaignsView';

export default function DemandesDisponibilitePage() {
  return (
    <div className="max-w-5xl">
      <AvailabilityCampaignsView mode="manage" />
    </div>
  );
}
