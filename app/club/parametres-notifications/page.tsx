'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';

// Les paramètres de notifications de l'espace club vivent désormais dans
// Configuration › Notifications. On garde cette route pour ne pas casser les
// liens existants : elle redirige vers l'onglet correspondant.
export default function NotificationSettingsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/club/configuration?tab=notifications');
  }, [router]);

  return <LoadingSpinner size={40} text="Redirection..." className="py-20" />;
}
