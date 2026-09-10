'use client';

import { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '@/app/components/layout/page-primitives';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Copy, Check, RefreshCw, CalendarDays, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiGet, apiPost } from '@/lib/utils/api';

/**
 * Vue unique de l'abonnement iCal personnel, partagée entre /club et /mon-planning
 * (issue #93). L'URL est chargée via `/api/planning/ical-link` (issue #382).
 */
export function MyCalendarView() {
  const { user } = useCurrentUser();
  const [feedUrl, setFeedUrl] = useState('');
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const loadFeedUrl = useCallback(async () => {
    setIsLoadingFeed(true);
    try {
      const data = await apiGet<{ feedUrl: string }>('/api/planning/ical-link');
      setFeedUrl(data.feedUrl);
    } catch {
      setFeedUrl('');
    } finally {
      setIsLoadingFeed(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void loadFeedUrl();
    }
  }, [user, loadFeedUrl]);

  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = feedUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`
    : '';
  const outlookUrl = feedUrl
    ? `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(webcalUrl)}&name=${encodeURIComponent('PlanningClub')}`
    : '';

  const handleCopy = async (value = feedUrl) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success('Lien copié');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Impossible de copier le lien');
    }
  };

  const handleRegenerate = async () => {
    if (!user) return;
    setIsRegenerating(true);
    try {
      const data = await apiPost<{ feedUrl: string }>(`/api/users/${user.id}/regenerate-ical-token`);
      setFeedUrl(data.feedUrl);
      toast.success('Lien régénéré');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
        <SectionCard
          icon={<CalendarDays />}
          title="Mon calendrier"
          description="Votre abonnement iCal personnel se met à jour automatiquement quand vos affectations changent."
          contentClassName="space-y-4"
        >
            <div className="flex items-center gap-2">
              <Input value={isLoadingFeed ? 'Chargement…' : feedUrl} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={() => handleCopy()} disabled={!feedUrl}>
                {copied ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="outline" asChild disabled={!googleUrl}><a href={googleUrl} target="_blank" rel="noreferrer">Google <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
              <Button variant="outline" asChild disabled={!outlookUrl}><a href={outlookUrl} target="_blank" rel="noreferrer">Outlook <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
              <Button variant="outline" onClick={() => handleCopy(webcalUrl)} disabled={!webcalUrl}>Copier webcal</Button>
            </div>
            <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating || !user}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} /> Régénérer le lien
            </Button>
            <p className="text-xs text-muted-foreground">Régénérer le lien invalide immédiatement l’ancienne URL. Utilisez-le si votre abonnement personnel a été partagé par erreur.</p>
        </SectionCard>
  );
}
