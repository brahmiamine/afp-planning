'use client';

import { useCallback, useEffect, useState } from 'react';
import { ClubArchivesList } from '@/app/components/archives/ClubArchivesList';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import type { OfficialArchiveRow } from '@/lib/archives/official-matches';
import { toast } from 'sonner';

export function ClubArchivesView() {
  const [items, setItems] = useState<OfficialArchiveRow[] | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ items: OfficialArchiveRow[] }>('/api/club/archives');
      setItems(data.items);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les archives');
      setItems([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (items === null) {
    return <LoadingSpinner size={44} text="Chargement des archives..." className="py-20" />;
  }

  return <ClubArchivesList items={items} />;
}
