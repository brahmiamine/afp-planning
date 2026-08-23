'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Copy, Check, RefreshCw, CalendarDays, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiPost } from '@/lib/utils/api';

export default function MonCalendrierPage() {
  const { user, reload } = useCurrentUser();
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const feedUrl = typeof window !== 'undefined' && user
    ? `${window.location.origin}/api/ical/${user.icalToken}`
    : '';
  const webcalUrl = feedUrl.replace(/^https?:\/\//, 'webcal://');
  const googleUrl = feedUrl
    ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`
    : '';
  const outlookUrl = feedUrl
    ? `https://outlook.live.com/calendar/0/addcalendar?url=${encodeURIComponent(webcalUrl)}&name=${encodeURIComponent('AFP Planning')}`
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
      await apiPost<{ icalToken: string }>(`/api/users/${user.id}/regenerate-ical-token`);
      toast.success('Lien régénéré');
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setIsRegenerating(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" /> Mon calendrier</CardTitle>
            <CardDescription>Votre abonnement iCal personnel se met à jour automatiquement quand vos affectations changent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={feedUrl} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={() => handleCopy()}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="outline" asChild disabled={!googleUrl}><a href={googleUrl} target="_blank" rel="noreferrer">Google <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
              <Button variant="outline" asChild disabled={!outlookUrl}><a href={outlookUrl} target="_blank" rel="noreferrer">Outlook <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
              <Button variant="outline" onClick={() => handleCopy(webcalUrl)} disabled={!webcalUrl}>Copier webcal</Button>
            </div>
            <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} /> Régénérer le lien
            </Button>
            <p className="text-xs text-muted-foreground">Régénérer le lien invalide immédiatement l’ancienne URL. Utilisez-le si votre abonnement personnel a été partagé par erreur.</p>
          </CardContent>
        </Card>
    </div>
  );
}
