'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiDelete, apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

interface EventItem { eventId: string; eventType: 'officiel' | 'amical' | 'entrainement' | 'plateau'; title: string; date: string; time: string; planningStatus: string; }
interface TemplateItem { id: string; payload: { name: string; eventType: 'amical' | 'entrainement' | 'plateau' } }
interface FilterItem { id: string; payload: { name: string; filters: Record<string, unknown> } }

export default function PlanningToolsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [filters, setFilters] = useState<FilterItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [bulkAction, setBulkAction] = useState('publish');
  const [sourceType, setSourceType] = useState<'amical' | 'entrainement' | 'plateau'>('entrainement');
  const [sourceId, setSourceId] = useState('');
  const [offsetDays, setOffsetDays] = useState('7');
  const [templateName, setTemplateName] = useState('');
  const [templateDate, setTemplateDate] = useState('');
  const [filterName, setFilterName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventData, templateData, filterData] = await Promise.all([
        apiGet<{ items: EventItem[] }>('/api/planning/events'),
        apiGet<{ templates: TemplateItem[] }>('/api/planning/templates'),
        apiGet<{ filters: FilterItem[] }>('/api/planning/saved-filters'),
      ]);
      setEvents(eventData.items);
      setTemplates(templateData.templates);
      setFilters(filterData.filters);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Chargement impossible'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => events.filter((item) => !q || `${item.title} ${item.date} ${item.eventType}`.toLowerCase().includes(q.toLowerCase())), [events, q]);

  const toggle = (item: EventItem) => {
    const key = `${item.eventType}:${item.eventId}`;
    setSelected((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };

  const bulk = async () => {
    const items = events.filter((item) => selected.has(`${item.eventType}:${item.eventId}`)).map((item) => ({ eventType: item.eventType, eventId: item.eventId }));
    try {
      const result = await apiPost<{ results: Array<{ success: boolean }> }>('/api/planning/bulk', { action: bulkAction, items });
      toast.success(`${result.results.filter((item) => item.success).length}/${result.results.length} événement(s) traité(s)`);
      setSelected(new Set()); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Action impossible'); }
  };

  const duplicate = async () => {
    try {
      await apiPost('/api/planning/duplicate', { eventType: sourceType, eventId: sourceId, offsetDays: Number(offsetDays), copyAssignments: false });
      toast.success('Événement dupliqué en brouillon'); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Duplication impossible'); }
  };

  const createTemplate = async () => {
    try {
      await apiPost('/api/planning/templates', { name: templateName, eventType: sourceType, sourceEventId: sourceId });
      toast.success('Modèle créé'); setTemplateName(''); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Création du modèle impossible'); }
  };

  const instantiate = async (templateId: string) => {
    try {
      await apiPost('/api/planning/templates', { action: 'instantiate', templateId, date: templateDate });
      toast.success('Événement créé depuis le modèle'); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Création impossible'); }
  };

  return (
    <div className="max-w-6xl space-y-6">
        <div><h2 className="text-2xl font-bold">Outils planning</h2><p className="text-sm text-muted-foreground">Actions en masse, duplication, modèles et filtres personnels.</p></div>
        {loading ? <LoadingSpinner text="Chargement..." className="py-12" /> : (
          <>
            <Card><CardHeader><CardTitle className="text-base">Actions en masse</CardTitle></CardHeader><CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2"><input className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Filtrer les événements" /><select className="rounded-md border bg-background px-3 py-2" value={bulkAction} onChange={(event) => setBulkAction(event.target.value)}><option value="publish">Publier</option><option value="draft">Brouillon</option><option value="cancel">Annuler</option><option value="reopen">Rouvrir</option><option value="remind">Relancer</option></select><Button onClick={bulk} disabled={!selected.size}>Appliquer à {selected.size}</Button></div>
              <div className="max-h-96 space-y-2 overflow-auto">{filtered.map((item) => { const key = `${item.eventType}:${item.eventId}`; return <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border p-3"><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(item)} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.date} {item.time} · {item.eventType}</p></div><Badge variant="outline">{item.planningStatus}</Badge></label>; })}</div>
            </CardContent></Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card><CardHeader><CardTitle className="text-base">Dupliquer / créer un modèle</CardTitle></CardHeader><CardContent className="space-y-3"><select className="w-full rounded-md border bg-background px-3 py-2" value={sourceType} onChange={(event) => setSourceType(event.target.value as typeof sourceType)}><option value="amical">Match amical</option><option value="entrainement">Entraînement</option><option value="plateau">Plateau</option></select><input className="w-full rounded-md border bg-background px-3 py-2" placeholder="ID de l’événement source" value={sourceId} onChange={(event) => setSourceId(event.target.value)} /><div className="flex gap-2"><input type="number" className="w-32 rounded-md border bg-background px-3 py-2" value={offsetDays} onChange={(event) => setOffsetDays(event.target.value)} /><Button onClick={duplicate} disabled={!sourceId}>Dupliquer</Button></div><div className="flex gap-2"><input className="flex-1 rounded-md border bg-background px-3 py-2" placeholder="Nom du modèle" value={templateName} onChange={(event) => setTemplateName(event.target.value)} /><Button variant="outline" onClick={createTemplate} disabled={!sourceId || !templateName}>Créer modèle</Button></div></CardContent></Card>
              <Card><CardHeader><CardTitle className="text-base">Modèles enregistrés</CardTitle></CardHeader><CardContent className="space-y-3"><input type="date" className="w-full rounded-md border bg-background px-3 py-2" value={templateDate} onChange={(event) => setTemplateDate(event.target.value)} />{templates.map((item) => <div key={item.id} className="flex items-center justify-between gap-2 rounded-md border p-3"><div><p className="text-sm font-medium">{item.payload.name}</p><p className="text-xs text-muted-foreground">{item.payload.eventType}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => instantiate(item.id)} disabled={!templateDate}>Utiliser</Button><Button size="sm" variant="destructive" onClick={async () => { await apiDelete(`/api/planning/templates?id=${encodeURIComponent(item.id)}`); await load(); }}>Supprimer</Button></div></div>)}</CardContent></Card>
            </section>

            <Card><CardHeader><CardTitle className="text-base">Filtres sauvegardés</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex gap-2"><input className="flex-1 rounded-md border bg-background px-3 py-2" placeholder="Nom du filtre" value={filterName} onChange={(event) => setFilterName(event.target.value)} /><Button onClick={async () => { await apiPost('/api/planning/saved-filters', { name: filterName, filters: { q } }); setFilterName(''); await load(); }}>Sauvegarder la recherche</Button></div><div className="flex flex-wrap gap-2">{filters.map((item) => <div key={item.id} className="flex items-center gap-1"><Button variant="outline" size="sm" onClick={() => setQ(String(item.payload.filters.q ?? ''))}>{item.payload.name}</Button><Button variant="ghost" size="sm" onClick={async () => { await apiDelete(`/api/planning/saved-filters?id=${encodeURIComponent(item.id)}`); await load(); }}>×</Button></div>)}</div></CardContent></Card>
          </>
        )}
    </div>
  );
}
