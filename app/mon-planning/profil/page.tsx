'use client';

import { Header } from '@/app/components/layout/Header';
import { ProfileView } from '@/app/components/profile/ProfileView';

// Wrapper espace personnel : la logique vit dans ProfileView (issue #93).
export default function ProfilPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto max-w-2xl px-3 py-6 sm:px-4 sm:py-8">
        <ProfileView />
      </main>
    </div>
  );
}
