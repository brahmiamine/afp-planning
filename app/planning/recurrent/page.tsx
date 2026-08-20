'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarRange, Pencil, Plus, Trash2 } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiDelete, apiGet, apiPost, apiPut } from '@/lib/utils/api';
import { toast } from 'sonner';

interface SeriesSummary {
  seriesId: string;
  eventType: 'entrainement' | 'plateau';
  count: number;
  firstDate: string;
  lastDate: string;
  time: string;
  lieu: string;
}

export default function PlanningRecurrentPage() {
  const [series, setSeries] = useState<SeriesSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState<'entrainement' | 'plateau'>('entrainement');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [time, setTime] = useState('18:00');
  const [lieu, setLieu] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [categorie, setCategorie] = useState('');
  const [frequencyWeeks, setFrequencyWeeks] = useState(1);
  const [editing, setEditing] = useState<SeriesSummary | null>(null);
  const [editTime, setEditTime] = useState('');
  const [editLieu, setEditLieu] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ series: SeriesSummary[] }>('/api/recurring-events');
      setSeries(data.series);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les séries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    try {
      const data = await apiPost<{ count: number }>('/api/recurring-events', {
        eventType,
        startDate,
        endDate,
        time,
        lieu,
        durationMinutes,
        frequencyWeeks,
        ...(eventType === 'entrainement' ? { categorie } : { categories: categorie ? categorie.split(',').map((value) => value.trim()).filter(Boolean) : [] }),
      });
      toast.success(`${data.count} occurrence(s) créée(s)`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Création impossible');
    }
  };

  const startEdit = (item: SeriesSummary) => {
    setEditing(item);
    setEditTime(item.time);
    setEditLieu(item.lieu);
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await apiPut(`/api/recurring-events/${editing.seriesId}`, { time: editTime, lieu: editLieu });
      toast.success('Toute la série a été modifiée');
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    }
  };

  const remove = async (seriesId: string) => {
    if (!window.confirm('Supprimer toutes les occurrences de cette série ?')) return;
    try {
      await apiDelete(`/api/recurring-events/${seriesId}`);
      toast.success('Série supprimée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Suppression impossible');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={load} />
      <main className="container mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-2xl font-bold"><CalendarRange className="h-6 w-6" /> Planning récurrent</h2>
          <p className="text-sm text-muted-foreground">Créez une série hebdomadaire puis modifiez une occurrence ou toute la série.</p>
        </div>

        <Card className="mb-6">
          <CardHeader><CardTitle>Nouvelle série</CardTitle><CardDescription>Entraînement ou plateau répété toutes les N semaines.</CardDescription></CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2"><Label>Type</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={eventType} onChange={(e) => setEventType(e.target.value as 'entrainement' | 'plateau')}><option value="entrainement">Entraînement</option><option value="plateau">Plateau</option></select></div>
            <div className="space-y-2"><Label>Début</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Fin</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>Heure</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div className="space-y-2"><Label>Durée (min)</Label><Input type="number" min={15} max={720} value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} /></div>
            <div className="space-y-2"><Label>Toutes les N semaines</Label><Input type="number" min={1} max={8} value={frequencyWeeks} onChange={(e) => setFrequencyWeeks(Number(e.target.value))} /></div>
            <div className="space-y-2 md:col-span-2"><Label>Lieu</Label><Input value={lieu} onChange={(e) => setLieu(e.target.value)} /></div>
            <div className="space-y-2"><Label>{eventType === 'entrainement' ? 'Catégorie' : 'Catégories (séparées par virgule)'}</Label><Input value={categorie} onChange={(e) => setCategorie(e.target.value)} /></div>
            <div className="md:col-span-3"><Button onClick={create}><Plus className="mr-2 h-4 w-4" /> Créer la série</Button></div>
          </CardContent>
        </Card>

        {loading ? <LoadingSpinner size={40} text="Chargement..." className="py-16" /> : (
          <div className="grid gap-3 lg:grid-cols-2">
            {series.map((item) => (
              <Card key={item.seriesId}>
                <CardHeader className="pb-2"><CardTitle className="text-base">{item.eventType === 'entrainement' ? 'Entraînements' : 'Plateaux'} · {item.count} occurrence(s)</CardTitle><CardDescription>{item.firstDate} → {item.lastDate}</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {editing?.seriesId === item.seriesId ? (
                    <div className="grid gap-2 sm:grid-cols-2"><Input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} /><Input value={editLieu} onChange={(e) => setEditLieu(e.target.value)} /><Button size="sm" onClick={saveEdit}>Enregistrer toute la série</Button><Button size="sm" variant="outline" onClick={() => setEditing(null)}>Annuler</Button></div>
                  ) : (
                    <><p className="text-sm">{item.time} · {item.lieu}</p><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => startEdit(item)}><Pencil className="mr-2 h-4 w-4" /> Modifier la série</Button><Button size="sm" variant="destructive" onClick={() => remove(item.seriesId)}><Trash2 className="mr-2 h-4 w-4" /> Supprimer</Button></div></>
                  )}
                </CardContent>
              </Card>
            ))}
            {!series.length && <Card><CardContent className="py-10 text-center text-muted-foreground">Aucune série récurrente.</CardContent></Card>}
          </div>
        )}
      </main>
    </div>
  );
}
