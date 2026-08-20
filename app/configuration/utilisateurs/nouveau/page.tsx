'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/app/components/layout/Header';
import { UserForm } from '@/app/components/configuration/UserForm';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { isSuperadmin } from '@/lib/auth/roles';

export default function NewUserPage() {
  const router = useRouter();
  const { user: currentUser, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && currentUser && !isSuperadmin(currentUser.roles)) {
      router.replace('/configuration');
    }
  }, [isLoading, currentUser, router]);

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto px-3 py-5 sm:px-4 sm:py-8 max-w-2xl">
        <UserForm />
      </main>
    </div>
  );
}
