'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Header } from '@/app/components/layout/Header';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { apiDelete, apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

interface AvailabilityCampaign {
  id: string;
  payload: {
    title: string;
    startDate: string;
    endDate: string;
    targetRoles: string[];
    message: string | null;
    closesAt: string | null;
  };
}

interface AvailabilityResponse {
  id: string;
  eventId: string | null;
  ownerUserId: number | null;
  payload: {
    status: 'available' | 'unavailable' | 'partial';
    availableFrom?: string | null;
    availableUntil?: string | null;
    comment?: string | null;
    respondentName?: string;
  };
}

export default function AvailabilityCampaignsPage() {
  const { user, isLoading } = useCurrentUser();
  const [campaigns, setCampaigns] = useState<AvailabilityCampaign[]>([]);
  const [responses, setResponses] = useState<AvailabilityResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('Disponibilités du week-end');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [message, setMessage] = useState('Merci d’indiquer votre disponibilité.');
  const [targetRoles, setTargetRoles] = useState<string[]>(['arbitre', 'encadrant', 'accompagnateur']);
  const [partialWindow, setPartialWindow] = useState<Record<string, { from: string; to: string; comment: string }>>({});

  const editable = user?.role === 'superadmin' || user?.role === 'admin';

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await apiGet<{ requests: AvailabilityCampaign[]; responses: AvailabilityResponse[] }>('/api/availability-requests');
      setCampaigns(data.requests);
      setResponses(data.responses);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const responseByRequest = useMemo(() => new Map(responses.map((response) => [response.eventId, response])), [responses]);

  if (isLoading || !user) return <LoadingSpinner size={44} text="Chargement..." className="min-h-screen" />;

  const createCampaign = async () => {
    try {
      await apiPost('/api/availability-requests', { title, startDate, endDate, targetRoles, message });
      toast.success('Demande envoyée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible');
    }
  };

  const respond = async (campaignId: string, status: 'available' | 'unavailable' | 'partial') => {
    const window = partialWindow[campaignId] ?? { from: '09:00', to: '18:00', comment: '' };
    try {
      await apiPost(`/api/availability-requests/${encodeURIComponent(campaignId)}/respond`, {
        status,
        availableFrom: status === 'partial' ? window.from : null,
        availableUntil: status === 'partial' ? window.to : null,
        comment: window.comment,
      });
      toast.success('Disponibilité enregistrée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Réponse impossible');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={load} />
      <main className="container mx-auto max-w-5xl space-y-6 px-3 py-6 sm:px-4">
        <div>
          <h2 className="text-2xl font-bold">Demandes de disponibilités</h2>
          <p className="text-sm text-muted-foreground">Anticipez le planning avant les affectations, sans remplacer les indisponibilités détaillées.</p>
        </div>

        {editable && (
          <Card>
            <CardHeader><CardTitle className="text-base">Nouvelle campagne</CardTitle></CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <label className="text-sm">Titre<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
              <label className="text-sm">Message<input className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={message} onChange={(event) => setMessage(event.target.value)} /></label>
              <label className="text-sm">Du<input type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
              <label className="text-sm">Au<input type="date" className="mt-1 w-full rounded-md border bg-background px-3 py-2" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                {['arbitre', 'encadrant', 'accompagnateur'].map((role) => (
                  <Button key={role} type="button" variant={targetRoles.includes(role) ? 'default' : 'outline'} onClick={() => setTargetRoles((current) => current.includes(role) ? current.filter((item) => item !== role) : [...current, role])}>
                    {role}
                  </Button>
                ))}
              </div>
              <Button onClick={createCampaign} disabled={!title || !startDate || !endDate || !targetRoles.length} className="md:col-span-2">Envoyer la demande</Button>
            </CardContent>
          </Card>
        )}

        {loading ? <LoadingSpinner text="Chargement..." className="py-10" /> : campaigns.length === 0 ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Aucune demande active.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((campaign) => {
              const myResponse = responseByRequest.get(campaign.id);
              const campaignResponses = editable ? responses.filter((response) => response.eventId === campaign.id) : [];
              const window = partialWindow[campaign.id] ?? { from: '09:00', to: '18:00', comment: '' };
              return (
                <Card key={campaign.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div><CardTitle className="text-base">{campaign.payload.title}</CardTitle><p className="text-sm text-muted-foreground">{campaign.payload.startDate} → {campaign.payload.endDate}</p></div>
                      {myResponse && <Badge variant="outline">{myResponse.payload.status}</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {campaign.payload.message && <p className="text-sm">{campaign.payload.message}</p>}
                    {editable ? (
                      <>
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Badge variant="outline">{campaignResponses.filter((item) => item.payload.status === 'available').length} disponibles</Badge>
                          <Badge variant="outline">{campaignResponses.filter((item) => item.payload.status === 'partial').length} partiels</Badge>
                          <Badge variant="destructive">{campaignResponses.filter((item) => item.payload.status === 'unavailable').length} indisponibles</Badge>
                        </div>
                        <div className="space-y-1 text-xs text-muted-foreground">
                          {campaignResponses.map((item) => <p key={item.id}>{item.payload.respondentName ?? `Utilisateur ${item.ownerUserId}`} : {item.payload.status}{item.payload.comment ? ` — ${item.payload.comment}` : ''}</p>)}
                        </div>
                        <Button variant="destructive" size="sm" onClick={async () => { await apiDelete(`/api/availability-requests?id=${encodeURIComponent(campaign.id)}`); await load(); }}>Supprimer</Button>
                      </>
                    ) : (
                      <>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Button onClick={() => respond(campaign.id, 'available')}>Disponible</Button>
                          <Button variant="destructive" onClick={() => respond(campaign.id, 'unavailable')}>Indisponible</Button>
                          <Button variant="outline" onClick={() => respond(campaign.id, 'partial')}>Disponible partiellement</Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <input type="time" className="rounded-md border bg-background px-3 py-2" value={window.from} onChange={(event) => setPartialWindow((current) => ({ ...current, [campaign.id]: { ...window, from: event.target.value } }))} />
                          <input type="time" className="rounded-md border bg-background px-3 py-2" value={window.to} onChange={(event) => setPartialWindow((current) => ({ ...current, [campaign.id]: { ...window, to: event.target.value } }))} />
                          <input className="rounded-md border bg-background px-3 py-2" placeholder="Commentaire" value={window.comment} onChange={(event) => setPartialWindow((current) => ({ ...current, [campaign.id]: { ...window, comment: event.target.value } }))} />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
