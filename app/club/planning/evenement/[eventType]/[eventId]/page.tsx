'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CloudSun } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';
import { EventChatPanel } from '@/app/components/chat/EventChatPanel';

interface RecordItem<T> { id: string; payload: T; }
interface CommentPayload { text: string; authorName: string; createdAt: string; authorUserId: number; }
interface TaskPayload { label: string; description: string | null; dueAt: string | null; completedAt: string | null; assigneeUserId: number | null; }
interface ReportPayload { category: string; text: string; authorName: string; authorRole: string; createdAt: string; }
interface Attachment { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; }
interface WeatherResult {
  available: boolean;
  provider: string;
  reason?: string;
  severity?: 'normal' | 'warning' | 'severe';
  temperatureC?: number | null;
  precipitationProbability?: number | null;
  windGustKmh?: number | null;
  alerts?: string[];
  locationSource?: string;
}

export default function EventWorkspacePage() {
  const params = useParams<{ eventType: string; eventId: string }>();
  const eventType = params.eventType;
  const eventId = params.eventId;
  const base = `/api/planning/events/${encodeURIComponent(eventType)}/${encodeURIComponent(eventId)}`;
  const [comments, setComments] = useState<Array<RecordItem<CommentPayload>>>([]);
  const [tasks, setTasks] = useState<Array<RecordItem<TaskPayload>>>([]);
  const [reports, setReports] = useState<Array<RecordItem<ReportPayload>>>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [weather, setWeather] = useState<WeatherResult | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [canSubmitReport, setCanSubmitReport] = useState(false);
  const [comment, setComment] = useState('');
  const [task, setTask] = useState('');
  const [report, setReport] = useState('');
  const [reportCategory, setReportCategory] = useState('organisation');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const weatherQuery = new URLSearchParams({ eventType, eventId });
      const [collaboration, reportData, attachmentData, weatherData] = await Promise.all([
        apiGet<{ comments: Array<RecordItem<CommentPayload>>; tasks: Array<RecordItem<TaskPayload>>; canManage: boolean }>(`${base}/collaboration`),
        apiGet<{ reports: Array<RecordItem<ReportPayload>>; canSubmit: boolean }>(`${base}/reports`),
        apiGet<{ attachments: Attachment[]; canManage: boolean }>(`${base}/attachments`),
        apiGet<WeatherResult>(`/api/planning/weather?${weatherQuery.toString()}`),
      ]);
      setComments(collaboration.comments);
      setTasks(collaboration.tasks);
      setReports(reportData.reports);
      setAttachments(attachmentData.attachments);
      setWeather(weatherData);
      setCanManage(collaboration.canManage || attachmentData.canManage);
      setCanSubmitReport(reportData.canSubmit);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Accès à l’espace événement impossible');
    } finally {
      setLoading(false);
    }
  }, [base, eventId, eventType]);

  useEffect(() => { void load(); }, [load]);

  const addComment = async () => {
    try {
      await apiPost(`${base}/collaboration`, { kind: 'comment', text: comment });
      setComment('');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Commentaire impossible'); }
  };

  const addTask = async () => {
    try {
      await apiPost(`${base}/collaboration`, { kind: 'task', label: task });
      setTask('');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Création de tâche impossible'); }
  };

  const addReport = async () => {
    try {
      await apiPost(`${base}/reports`, { category: reportCategory, text: report });
      setReport('');
      toast.success('Rapport envoyé');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Rapport impossible'); }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set('file', file);
    try {
      const response = await fetch(`${base}/attachments`, { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload impossible');
      toast.success('Document ajouté');
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Upload impossible'); }
  };

  return (
    <div className="max-w-5xl space-y-6">
        <div><h2 className="text-2xl font-bold">Espace événement</h2><p className="text-sm text-muted-foreground">{eventType} · {eventId}</p></div>
        {loading ? <LoadingSpinner text="Chargement..." className="py-16" /> : (
          <>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><CloudSun className="h-5 w-5" /> Météo de l’événement</CardTitle></CardHeader>
              <CardContent>
                {weather?.available ? <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Badge variant={weather.severity === 'severe' ? 'destructive' : 'outline'}>{weather.severity === 'severe' ? 'Alerte' : weather.severity === 'warning' ? 'Vigilance' : 'Conditions normales'}</Badge>
                  {weather.temperatureC !== null && weather.temperatureC !== undefined && <span>{Math.round(weather.temperatureC)} °C</span>}
                  {weather.precipitationProbability !== null && weather.precipitationProbability !== undefined && <span>Pluie {Math.round(weather.precipitationProbability)} %</span>}
                  {weather.windGustKmh !== null && weather.windGustKmh !== undefined && <span>Rafales {Math.round(weather.windGustKmh)} km/h</span>}
                  {weather.locationSource && <span className="text-muted-foreground">{weather.locationSource}</span>}
                  {!!weather.alerts?.length && <span className="w-full text-amber-700 dark:text-amber-400">{weather.alerts.join(' · ')}</span>}
                  <span className="w-full text-xs text-muted-foreground">Source : Open-Meteo · prévision indicative, sans impact automatique sur le planning.</span>
                </div> : <p className="text-sm text-muted-foreground">Prévision indisponible pour ce lieu ou cette échéance. Source configurée : Open-Meteo.</p>}
              </CardContent>
            </Card>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Commentaires</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2"><input className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Ajouter une information..." /><Button onClick={addComment} disabled={!comment.trim()}>Envoyer</Button></div>
                  {comments.map((item) => <div key={item.id} className="rounded-md border p-3"><p className="text-sm">{item.payload.text}</p><p className="mt-1 text-xs text-muted-foreground">{item.payload.authorName} · {new Date(item.payload.createdAt).toLocaleString('fr-FR')}</p></div>)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Checklist / tâches</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {canManage && <div className="flex gap-2"><input className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Ex. récupérer les clés" /><Button onClick={addTask} disabled={!task.trim()}>Ajouter</Button></div>}
                  {tasks.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className={item.payload.completedAt ? 'text-sm line-through' : 'text-sm'}>{item.payload.label}</p>{item.payload.description && <p className="text-xs text-muted-foreground">{item.payload.description}</p>}</div><Button size="sm" variant={item.payload.completedAt ? 'outline' : 'default'} onClick={async () => { await apiPatch(`${base}/collaboration`, { id: item.id, completed: !item.payload.completedAt }); await load(); }}>{item.payload.completedAt ? 'Rouvrir' : 'Fait'}</Button></div>)}
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {canManage && <input type="file" className="block w-full text-sm" onChange={(event) => void upload(event.target.files?.[0])} accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx" />}
                  {attachments.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{item.fileName}</p><p className="text-xs text-muted-foreground">{Math.ceil(item.sizeBytes / 1024)} Ko</p></div><div className="flex gap-2"><Button size="sm" variant="outline" asChild><a href={`/api/planning/attachments/${item.id}`}>Télécharger</a></Button>{canManage && <Button size="sm" variant="destructive" onClick={async () => { await apiDelete(`/api/planning/attachments/${item.id}`); await load(); }}>Supprimer</Button>}</div></div>)}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base">Rapports post-événement</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {canSubmitReport && <div className="space-y-2"><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option value="organisation">Organisation</option><option value="incident">Incident</option><option value="sportif">Sportif</option><option value="other">Autre</option></select><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={report} onChange={(event) => setReport(event.target.value)} placeholder="Compte rendu / incident / remarque..." /><Button onClick={addReport} disabled={!report.trim()}>Envoyer le rapport</Button></div>}
                  {reports.map((item) => <div key={item.id} className="rounded-md border p-3"><div className="mb-1 flex items-center gap-2"><Badge variant="outline">{item.payload.category}</Badge><span className="text-xs text-muted-foreground">{item.payload.authorName}</span></div><p className="whitespace-pre-wrap text-sm">{item.payload.text}</p></div>)}
                </CardContent>
              </Card>
            </section>

            <EventChatPanel eventType={eventType} eventId={eventId} />
          </>
        )}
    </div>
  );
}
