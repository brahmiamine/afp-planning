'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Header } from '@/app/components/layout/Header';
import { UserForm } from '@/app/components/configuration/UserForm';
import { useUsers } from '@/app/hooks/useUsers';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { isSuperadmin } from '@/lib/auth/roles';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const { user: currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser();
  const { users, isLoading: isLoadingUsers } = useUsers();

  useEffect(() => {
    if (!isLoadingCurrentUser && currentUser && !isSuperadmin(currentUser.roles)) {
      router.replace('/configuration');
    }
  }, [isLoadingCurrentUser, currentUser, router]);

  const userId = Number.parseInt(params.id, 10);
  const user = users.find((item) => item.id === userId);

  useEffect(() => {
    if (!isLoadingUsers && !user) {
      router.replace('/configuration?tab=utilisateurs');
    }
  }, [isLoadingUsers, user, router]);

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto px-3 py-5 sm:px-4 sm:py-8 max-w-2xl">
        {isLoadingUsers || !user ? (
          <LoadingSpinner size={40} text="Chargement..." className="py-20" />
        ) : (
          <UserForm user={user} />
        )}
      </main>
    </div>
  );
}
