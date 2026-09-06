'use client';

import { AvailabilityCampaignsView } from '@/app/components/availability/AvailabilityCampaignsView';

// Wrapper espace club : la logique vit dans AvailabilityCampaignsView (issue #93).
export default function AvailabilityCampaignsPage() {
  return (
    <div className="max-w-5xl">
      <AvailabilityCampaignsView mode="manage" />
    </div>
  );
}
