'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Check, X } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';
type SwapStatus = 'pending-target' | 'pending-admin' | 'declined' | 'approved' | 'rejected' | 'cancelled';

interface PersonalAssignment {
  assignmentId: string;
  eventId: string;
  eventType: EventType;
  role: PlanningRole;
  status: 'pending' | 'accepted' | 'declined';
  date: string;
  time: string;
  durationMinutes: number;
  title: string;
}

interface SwapRecord {
  id: string;
  payload: {
    role: PlanningRole;
    eventType: EventType;
    eventId: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    requester: { userId: number; nom: string };
    target: { userId: number; nom: string };
    status: SwapStatus;
    message: string | null;
  };
}

interface Candidate {
  userId: number;
  personId: number;
  personType: 'officiel' | 'encadrant' | 'accompagnateur';
  nom: string;
  score: number;
  reasons: string[];
}

interface SwapResponse { mine: SwapRecord[]; incoming: SwapRecord[]; candidates: Candidate[] }
interface PlanningResponse { assignments: PersonalAssignment[] }

const statusLabels: Record<SwapStatus, string> = {
  'pending-target': 'En attente de la personne',
  'pending-admin': 'En attente de validation admin',
  declined: 'Refusé par la personne',
  approved: 'Validé',
  rejected: 'Refusé par l’admin',
  cancelled: 'Annulé',
};

function eventTimestamp(item: PersonalAssignment): number {
  const [day, month, year] = item.date.split('/').map(Number);
  const [hour, minute] = item.time.replace('h', ':').split(':').map(Number);
  return new Date(year, month - 1, day, hour || 0, minute || 0).getTime();
}

export default function MesEchangesPage() {
  const [planning, setPlanning] = useState<PlanningResponse | null>(null);
  const [swaps, setSwaps] = useState<SwapResponse | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [planningData, swapData] = await Promise.all([
        apiGet<PlanningResponse>('/api/me/planning'),
        apiGet<SwapResponse>('/api/me/assignment-swaps'),
      ]);
      setPlanning(planningData);
      setSwaps(swapData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les échanges');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const eligibleAssignments = useMemo(() => (planning?.assignments ?? []).filter((item) =>
    item.status !== 'declined' && eventTimestamp(item) > Date.now()), [planning]);

  const selectedAssignment = eligibleAssignments.find((item) => item.assignmentId === selectedAssignmentId) ?? null;

  const chooseAssignment = async (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);
    setSelectedCandidate('');
    setCandidates([]);
    const assignment = eligibleAssignments.find((item) => item.assignmentId === assignmentId);
    if (!assignment) return;
    try {
      const query = new URLSearchParams({ eventType: assignment.eventType, eventId: assignment.eventId, role: assignment.role });
      const response = await apiGet<SwapResponse>(`/api/me/assignment-swaps?${query.toString()}`);
      setCandidates(response.candidates);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les remplaçants éligibles');
    }
  };

  const createSwap = async () => {
    if (!selectedAssignment || !selectedCandidate) return;
    const candidate = candidates.find((item) => `${item.userId}:${item.personType}:${item.personId}` === selectedCandidate);
    if (!candidate) return;
    setBusy(true);
    try {
      await apiPost('/api/me/assignment-swaps', {
        action: 'create',
        eventType: selectedAssignment.eventType,
        eventId: selectedAssignment.eventId,
        role: selectedAssignment.role,
        targetUserId: candidate.userId,
        targetPersonType: candidate.personType,
        targetPersonId: candidate.personId,
        message,
      });
      toast.success('Proposition d’échange envoyée');
      setSelectedAssignmentId(''); setSelectedCandidate(''); setCandidates([]); setMessage('');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de proposer l’échange');
    } finally { setBusy(false); }
  };

  const respond = async (recordId: string, decision: 'accept' | 'decline') => {
    setBusy(true);
    try {
      await apiPost('/api/me/assignment-swaps', { action: 'respond', recordId, decision });
      toast.success(decision === 'accept' ? 'Échange accepté, validation admin requise' : 'Échange refusé');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de répondre à l’échange');
    } finally { setBusy(false); }
  };

  const cancel = async (recordId: string) => {
    setBusy(true);
    try {
      await apiPost('/api/me/assignment-swaps', { action: 'cancel', recordId });
      toast.success('Demande annulée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d’annuler la demande');
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingSpinner size={44} text="Chargement des échanges..." className="min-h-screen" />;

  return <div className="min-h-screen bg-background">
    <Header onScrapeComplete={() => undefined} />
    <main className="container mx-auto space-y-6 px-3 py-5 sm:px-4 sm:py-8">
      <div><h2 className="flex items-center gap-2 text-2xl font-bold"><ArrowLeftRight className="h-6 w-6" /> Échanges d’affectations</h2><p className="text-sm text-muted-foreground">Proposez un échange à une personne disponible. L’échange devient effectif seulement après son accord puis validation d’un administrateur.</p></div>

      <Card><CardHeader><CardTitle>Proposer un échange</CardTitle></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">
        <select className="rounded-md border bg-background px-3 py-2" value={selectedAssignmentId} onChange={(event) => void chooseAssignment(event.target.value)}>
          <option value="">Choisir une affectation à venir</option>
          {eligibleAssignments.map((item) => <option key={item.assignmentId} value={item.assignmentId}>{item.date} {item.time} · {item.title} · {item.role}</option>)}
        </select>
        <select className="rounded-md border bg-background px-3 py-2" value={selectedCandidate} onChange={(event) => setSelectedCandidate(event.target.value)} disabled={!selectedAssignment}>
          <option value="">Choisir une personne éligible</option>
          {candidates.map((candidate) => <option key={`${candidate.userId}:${candidate.personType}:${candidate.personId}`} value={`${candidate.userId}:${candidate.personType}:${candidate.personId}`}>{candidate.nom} · score {candidate.score}</option>)}
        </select>
        <input className="rounded-md border bg-background px-3 py-2 md:col-span-2" maxLength={500} placeholder="Message optionnel" value={message} onChange={(event) => setMessage(event.target.value)} />
        {selectedCandidate && <div className="text-xs text-muted-foreground md:col-span-2">{candidates.find((item) => `${item.userId}:${item.personType}:${item.personId}` === selectedCandidate)?.reasons.join(' · ')}</div>}
        <div className="md:col-span-2"><Button onClick={createSwap} disabled={!selectedAssignment || !selectedCandidate || busy}>Envoyer la proposition</Button></div>
      </CardContent></Card>

      <section><h3 className="mb-3 text-lg font-semibold">Propositions reçues</h3><div className="grid gap-3 lg:grid-cols-2">
        {(swaps?.incoming ?? []).length ? swaps?.incoming.map((swap) => <Card key={swap.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{swap.payload.eventTitle}</p><p className="text-sm text-muted-foreground">{swap.payload.eventDate} · {swap.payload.eventTime} · {swap.payload.role}</p><p className="text-sm">Proposé par {swap.payload.requester.nom}</p></div><Badge variant="outline">{statusLabels[swap.payload.status]}</Badge></div>{swap.payload.message && <p className="rounded-md bg-muted p-2 text-sm">{swap.payload.message}</p>}{swap.payload.status === 'pending-target' && <div className="flex gap-2"><Button size="sm" onClick={() => respond(swap.id, 'accept')} disabled={busy}><Check className="mr-1 h-4 w-4" /> Accepter</Button><Button size="sm" variant="destructive" onClick={() => respond(swap.id, 'decline')} disabled={busy}><X className="mr-1 h-4 w-4" /> Refuser</Button></div>}</CardContent></Card>) : <Card><CardContent className="py-8 text-center text-muted-foreground">Aucune proposition reçue.</CardContent></Card>}
      </div></section>

      <section><h3 className="mb-3 text-lg font-semibold">Mes demandes</h3><div className="grid gap-3 lg:grid-cols-2">
        {(swaps?.mine ?? []).length ? swaps?.mine.map((swap) => <Card key={swap.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{swap.payload.eventTitle}</p><p className="text-sm text-muted-foreground">Avec {swap.payload.target.nom} · {swap.payload.eventDate} {swap.payload.eventTime}</p></div><Badge variant={swap.payload.status === 'approved' ? 'default' : 'outline'}>{statusLabels[swap.payload.status]}</Badge></div>{(swap.payload.status === 'pending-target' || swap.payload.status === 'pending-admin') && <Button size="sm" variant="outline" onClick={() => cancel(swap.id)} disabled={busy}>Annuler la demande</Button>}</CardContent></Card>) : <Card><CardContent className="py-8 text-center text-muted-foreground">Aucune demande d’échange.</CardContent></Card>}
      </div></section>
    </main>
  </div>;
}
