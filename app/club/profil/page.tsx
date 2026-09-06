'use client';

import { ProfileView } from '@/app/components/profile/ProfileView';

// Wrapper espace club : la logique vit dans ProfileView (issue #93).
export default function ProfilPage() {
  return (
    <div className="max-w-2xl">
      <ProfileView />
    </div>
  );
}
