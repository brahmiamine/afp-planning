'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  CloudSun,
  MapPin,
  Timer,
  Users,
} from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/app/components/ui/card';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';
import { EventChatPanel } from '@/app/components/chat/EventChatPanel';

type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type PlanningRole = 'arbitre' | 'encadrant' | 'accompagnateur';
type PlanningStatus = 'draft' | 'published' | 'modified' | 'cancelled';

interface RecordItem<T> { id: string; payload: T; }
interface CommentPayload { text: string; authorName: string; createdAt: string; authorUserId: number; }
interface TaskPayload { label: string; description: string | null; dueAt: string | null; completedAt: string | null; assigneeUserId: number | null; }
interface ReportPayload { category: string; text: string; authorName: string; authorRole: string; createdAt: string; }
interface Attachment { id: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; }
interface AssignmentContact { nom: string; numero?: string; status?: string; attendanceStatus?: string; }
interface EventPayload {
  localTeam?: string;
  awayTeam?: string;
  competition?: string;
  categorie?: string;
  categories?: string[];
  venue?: string;
  horaireRendezVous?: string;
  lieu?: string;
  details?: {
    stadium?: string;
    address?: string;
    terrainType?: string;
    itineraryLink?: string;
  } | null;
  staff?: {
    referee?: string;
    assistant1?: string;
    assistant2?: string;
  } | null;
}
interface EventSnapshot {
  eventId: string;
  eventType: EventType;
  title: string;
  date: string;
  time: string;
  durationMinutes: number;
  location: string | null;
  planningStatus: PlanningStatus;
  event: EventPayload;
  assignments: Record<PlanningRole, AssignmentContact[]>;
}
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

const eventTypeLabels: Record<EventType, string> = {
  officiel: 'Match officiel',
  amical: 'Match amical',
  entrainement: 'Entraînement',
  plateau: 'Plateau',
};

const roleLabels: Record<PlanningRole, string> = {
  arbitre: 'Arbitre',
  encadrant: 'Encadrant',
  accompagnateur: 'Accompagnateur',
};

function planningStatusBadge(status: PlanningStatus) {
  if (status === 'draft') return <Badge variant="secondary">Brouillon</Badge>;
  if (status === 'modified') return <Badge variant="outline">Modifié</Badge>;
  if (status === 'cancelled') return <Badge variant="destructive">Annulé</Badge>;
  return <Badge>Publié</Badge>;
}

export default function EventWorkspacePage() {
  const params = useParams<{ eventType: EventType; eventId: string }>();
  const eventType = params.eventType;
  const eventId = params.eventId;
  const base = `/api/planning/events/${encodeURIComponent(eventType)}/${encodeURIComponent(eventId)}`;
  const [eventDetails, setEventDetails] = useState<EventSnapshot | null>(null);
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
      const [snapshot, collaboration, reportData, attachmentData, weatherData] = await Promise.all([
        apiGet<EventSnapshot>(base),
        apiGet<{ comments: Array<RecordItem<CommentPayload>>; tasks: Array<RecordItem<TaskPayload>>; canManage: boolean }>(`${base}/collaboration`),
        apiGet<{ reports: Array<RecordItem<ReportPayload>>; canSubmit: boolean }>(`${base}/reports`),
        apiGet<{ attachments: Attachment[]; canManage: boolean }>(`${base}/attachments`),
        apiGet<WeatherResult>(`/api/planning/weather?${weatherQuery.toString()}`),
      ]);
      setEventDetails(snapshot);
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

  const payload = eventDetails?.event;
  const isMatch = eventDetails?.eventType === 'officiel' || eventDetails?.eventType === 'amical';

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <Button variant="ghost" size="sm" asChild className="-ml-2 gap-2">
          <Link href="/club/evenements"><ArrowLeft className="h-4 w-4" /> Espace événements</Link>
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Espace événements</p>
            <h2 className="text-2xl font-bold sm:text-3xl">{eventDetails?.title ?? 'Détail de l’événement'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Toutes les informations opérationnelles et collaboratives de l’événement.</p>
          </div>
          {eventDetails && <div className="flex flex-wrap gap-2"><Badge variant="outline">{eventTypeLabels[eventDetails.eventType]}</Badge>{planningStatusBadge(eventDetails.planningStatus)}</div>}
        </div>
      </div>

      {loading ? <LoadingSpinner text="Chargement de l’espace événement..." className="py-16" /> : eventDetails ? (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">Détails de l’événement</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border p-3"><CalendarDays className="mb-2 h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Date</p><p className="font-medium">{eventDetails.date}</p></div>
                <div className="rounded-lg border p-3"><Clock3 className="mb-2 h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Heure</p><p className="font-medium">{eventDetails.time || 'Non renseignée'}</p></div>
                <div className="rounded-lg border p-3"><Timer className="mb-2 h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Durée</p><p className="font-medium">{eventDetails.durationMinutes} min</p></div>
                <div className="rounded-lg border p-3"><MapPin className="mb-2 h-4 w-4 text-muted-foreground" /><p className="text-xs text-muted-foreground">Lieu</p><p className="font-medium">{eventDetails.location || payload?.lieu || 'Non renseigné'}</p></div>
              </div>

              {isMatch ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rencontre</p>
                    <p className="mt-2 text-lg font-semibold">{payload?.localTeam || 'Équipe locale'} <span className="text-muted-foreground">–</span> {payload?.awayTeam || 'Équipe visiteuse'}</p>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      {payload?.competition && <p>Compétition : <span className="text-foreground">{payload.competition}</span></p>}
                      {payload?.categorie && <p>Catégorie : <span className="text-foreground">{payload.categorie}</span></p>}
                      {payload?.venue && <p>Lieu de rencontre : <span className="text-foreground">{payload.venue}</span></p>}
                      {payload?.horaireRendezVous && <p>Rendez-vous : <span className="text-foreground">{payload.horaireRendezVous}</span></p>}
                    </div>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stade & officiels</p>
                    <div className="mt-2 space-y-1 text-sm">
                      {payload?.details?.stadium && <p className="font-medium">{payload.details.stadium}</p>}
                      {payload?.details?.address && <p className="text-muted-foreground">{payload.details.address}</p>}
                      {payload?.details?.terrainType && <p className="text-muted-foreground">Terrain : {payload.details.terrainType}</p>}
                      {payload?.staff?.referee && <p>Arbitre officiel : {payload.staff.referee}</p>}
                      {payload?.staff?.assistant1 && <p>Assistant 1 : {payload.staff.assistant1}</p>}
                      {payload?.staff?.assistant2 && <p>Assistant 2 : {payload.staff.assistant2}</p>}
                      {payload?.details?.itineraryLink && <a className="inline-block pt-1 text-primary hover:underline" href={payload.details.itineraryLink} target="_blank" rel="noreferrer">Ouvrir l’itinéraire</a>}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border p-4 text-sm">
                  {payload?.categorie && <p>Catégorie : <span className="font-medium">{payload.categorie}</span></p>}
                  {!!payload?.categories?.length && <p>Catégories : <span className="font-medium">{payload.categories.join(', ')}</span></p>}
                  {payload?.lieu && <p>Lieu : <span className="font-medium">{payload.lieu}</span></p>}
                </div>
              )}

              <div>
                <div className="mb-2 flex items-center gap-2"><Users className="h-4 w-4" /><p className="text-sm font-semibold">Affectations</p></div>
                <div className="grid gap-3 md:grid-cols-3">
                  {(Object.keys(roleLabels) as PlanningRole[]).map((role) => (
                    <div key={role} className="rounded-lg border p-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{roleLabels[role]}</p>
                      {eventDetails.assignments[role].length ? eventDetails.assignments[role].map((contact, index) => (
                        <div key={`${contact.nom}:${index}`} className="mt-2 text-sm">
                          <p className="font-medium">{contact.nom}</p>
                          {contact.numero && <p className="text-xs text-muted-foreground">{contact.numero}</p>}
                          {contact.status && <p className="text-xs text-muted-foreground">Statut : {contact.status}</p>}
                        </div>
                      )) : <p className="mt-2 text-sm text-muted-foreground">Aucune affectation</p>}
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

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
                {comments.length ? comments.map((item) => <div key={item.id} className="rounded-md border p-3"><p className="text-sm">{item.payload.text}</p><p className="mt-1 text-xs text-muted-foreground">{item.payload.authorName} · {new Date(item.payload.createdAt).toLocaleString('fr-FR')}</p></div>) : <p className="text-sm text-muted-foreground">Aucun commentaire.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Check-list / tâches</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {canManage && <div className="flex gap-2"><input className="flex-1 rounded-md border bg-background px-3 py-2 text-sm" value={task} onChange={(event) => setTask(event.target.value)} placeholder="Ex. récupérer les clés" /><Button onClick={addTask} disabled={!task.trim()}>Ajouter</Button></div>}
                {tasks.length ? tasks.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className={item.payload.completedAt ? 'text-sm line-through' : 'text-sm'}>{item.payload.label}</p>{item.payload.description && <p className="text-xs text-muted-foreground">{item.payload.description}</p>}</div><Button size="sm" variant={item.payload.completedAt ? 'outline' : 'default'} onClick={async () => { await apiPatch(`${base}/collaboration`, { id: item.id, completed: !item.payload.completedAt }); await load(); }}>{item.payload.completedAt ? 'Rouvrir' : 'Fait'}</Button></div>) : <p className="text-sm text-muted-foreground">Aucune tâche.</p>}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {canManage && <input type="file" className="block w-full text-sm" onChange={(event) => void upload(event.target.files?.[0])} accept=".pdf,.jpg,.jpeg,.png,.webp,.txt,.csv,.docx,.xlsx" />}
                {attachments.length ? attachments.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-md border p-3"><div><p className="text-sm font-medium">{item.fileName}</p><p className="text-xs text-muted-foreground">{Math.ceil(item.sizeBytes / 1024)} Ko</p></div><div className="flex gap-2"><Button size="sm" variant="outline" asChild><a href={`/api/planning/attachments/${item.id}`}>Télécharger</a></Button>{canManage && <Button size="sm" variant="destructive" onClick={async () => { await apiDelete(`/api/planning/attachments/${item.id}`); await load(); }}>Supprimer</Button>}</div></div>) : <p className="text-sm text-muted-foreground">Aucun document.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Rapports post-événement</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {canSubmitReport && <div className="space-y-2"><select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={reportCategory} onChange={(event) => setReportCategory(event.target.value)}><option value="organisation">Organisation</option><option value="incident">Incident</option><option value="sportif">Sportif</option><option value="other">Autre</option></select><textarea className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm" value={report} onChange={(event) => setReport(event.target.value)} placeholder="Compte rendu / incident / remarque..." /><Button onClick={addReport} disabled={!report.trim()}>Envoyer le rapport</Button></div>}
                {reports.length ? reports.map((item) => <div key={item.id} className="rounded-md border p-3"><div className="mb-1 flex items-center gap-2"><Badge variant="outline">{item.payload.category}</Badge><span className="text-xs text-muted-foreground">{item.payload.authorName}</span></div><p className="whitespace-pre-wrap text-sm">{item.payload.text}</p></div>) : <p className="text-sm text-muted-foreground">Aucun rapport.</p>}
              </CardContent>
            </Card>
          </section>

          <EventChatPanel eventType={eventType} eventId={eventId} />
        </>
      ) : (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Impossible de charger les détails de cet événement.</CardContent></Card>
      )}
    </div>
  );
}
