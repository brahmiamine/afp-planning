'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

type SwapStatus = 'pending-target' | 'pending-admin' | 'declined' | 'approved' | 'rejected' | 'cancelled';
interface SwapRecord {
  id: string;
  payload: {
    role: string;
    eventTitle: string;
    eventDate: string;
    eventTime: string;
    requester: { nom: string };
    target: { nom: string };
    status: SwapStatus;
    message: string | null;
  };
}
interface SwapResponse { swaps: SwapRecord[]; recent: SwapRecord[] }

const labels: Record<SwapStatus, string> = {
  'pending-target': 'Attente cible',
  'pending-admin': 'À valider',
  declined: 'Refusé par la cible',
  approved: 'Validé',
  rejected: 'Refusé par admin',
  cancelled: 'Annulé',
};

export default function AssignmentSwapsAdminPage() {
  const [data, setData] = useState<SwapResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { setData(await apiGet<SwapResponse>('/api/planning/assignment-swaps')); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Impossible de charger les échanges'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const decide = async (recordId: string, decision: 'approve' | 'reject') => {
    setBusy(true);
    try {
      await apiPost('/api/planning/assignment-swaps', { recordId, decision });
      toast.success(decision === 'approve' ? 'Échange validé' : 'Échange refusé');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de traiter cet échange');
    } finally { setBusy(false); }
  };

  if (loading) return <LoadingSpinner size={44} text="Chargement des échanges..." className="min-h-screen" />;
  return <div className="space-y-6">
    <div><h2 className="flex items-center gap-2 text-2xl font-bold"><ArrowLeftRight className="h-6 w-6" /> Validation des échanges</h2><p className="text-sm text-muted-foreground">Un échange accepté par les deux personnes reste sans effet tant qu’un administrateur ne l’a pas validé. Le serveur recontrôle les conflits et la disponibilité au moment de l’approbation.</p></div>
    <section><h3 className="mb-3 text-lg font-semibold">À valider</h3><div className="grid gap-3 lg:grid-cols-2">{data?.swaps.length ? data.swaps.map((swap) => <Card key={swap.id}><CardContent className="space-y-3 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{swap.payload.eventTitle}</p><p className="text-sm text-muted-foreground">{swap.payload.eventDate} · {swap.payload.eventTime} · {swap.payload.role}</p><p className="text-sm">{swap.payload.requester.nom} → {swap.payload.target.nom}</p></div><Badge>À valider</Badge></div>{swap.payload.message && <p className="rounded-md bg-muted p-2 text-sm">{swap.payload.message}</p>}<div className="flex gap-2"><Button size="sm" onClick={() => decide(swap.id, 'approve')} disabled={busy}>Valider</Button><Button size="sm" variant="destructive" onClick={() => decide(swap.id, 'reject')} disabled={busy}>Refuser</Button></div></CardContent></Card>) : <Card><CardContent className="py-8 text-center text-muted-foreground">Aucun échange à valider.</CardContent></Card>}</div></section>
    <section><h3 className="mb-3 text-lg font-semibold">Historique récent</h3><div className="grid gap-2 md:grid-cols-2">{data?.recent.slice(0, 40).map((swap) => <div key={swap.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm"><span>{swap.payload.requester.nom} → {swap.payload.target.nom} · {swap.payload.eventTitle}</span><Badge variant="outline">{labels[swap.payload.status]}</Badge></div>)}</div></section>
  </div>;
}
