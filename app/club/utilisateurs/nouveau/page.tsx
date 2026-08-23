'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserForm } from '@/app/components/configuration/UserForm';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { canEdit } from '@/lib/auth/roles';

export default function NewUserPage() {
  const router = useRouter();
  const { user: currentUser, isLoading } = useCurrentUser();

  useEffect(() => {
    if (!isLoading && currentUser && !canEdit(currentUser.roles)) {
      router.replace('/club/configuration');
    }
  }, [isLoading, currentUser, router]);

  return (
    <div className="max-w-2xl">
        <UserForm />
    </div>
  );
}
