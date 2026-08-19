'use client';

import { useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Copy, Check, RefreshCw, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/app/hooks/useCurrentUser';
import { apiPost } from '@/lib/utils/api';

export default function MonCalendrierPage() {
  const { user, reload } = useCurrentUser();
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const feedUrl =
    typeof window !== 'undefined' && user
      ? `${window.location.origin}/api/ical/${user.icalToken}`
      : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(feedUrl);
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
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => {}} />
      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Mon calendrier
            </CardTitle>
            <CardDescription>
              Copiez cette URL et ajoutez-la dans votre application de calendrier (Google Calendar via
              &quot;Autre calendrier → À partir de l&apos;URL&quot;, Apple Calendrier via &quot;Fichier → Nouvel abonnement au
              calendrier&quot;...) pour recevoir automatiquement vos événements.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Input value={feedUrl} readOnly className="font-mono text-xs" />
              <Button type="button" variant="outline" size="icon" onClick={handleCopy}>
                {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRegenerating ? 'animate-spin' : ''}`} />
              Régénérer le lien
            </Button>
            <p className="text-xs text-muted-foreground">
              Régénérer le lien invalide l&apos;ancienne URL — utile si elle a été partagée par erreur.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
