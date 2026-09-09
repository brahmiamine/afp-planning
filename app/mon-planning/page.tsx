'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, Clock3, History, MapPin, X } from 'lucide-react';
import { Header } from '@/app/components/layout/Header';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/app/components/ui/card';
import { PageHeader, StatCard, StatusPill } from '@/app/components/layout/page-primitives';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet, apiPost } from '@/lib/utils/api';
import { isInteractiveTarget, personalEventWorkspaceHref } from '@/lib/planning/event-links';
import { eventStartTimestamp } from '@/lib/planning/p0-rules';
import { zonedDayStart } from '@/lib/planning/planning-time';
import { useAppSettings } from '@/hooks/useAppSettings';
import { TeamMatchup } from '@/app/components/matches/TeamMatchup';
import { toast } from 'sonner';

type AssignmentStatus = 'pending' | 'accepted' | 'declined';
type EventType = 'officiel' | 'amical' | 'entrainement' | 'plateau';
type DeclineReason = 'work' | 'injury' | 'travel' | 'other_assignment' | 'personal' | 'other';

interface PersonalAssignment {
  assignmentId: string;
  eventId: string;
  eventType: EventType;
  role: 'arbitre' | 'encadrant' | 'accompagnateur';
  roles: Array<'arbitre' | 'encadrant' | 'accompagnateur'>;
  status: AssignmentStatus;
  respondedAt: string | null;
  declineReason?: DeclineReason | null;
  declineComment?: string | null;
  date: string;
  time: string;
  durationMinutes: number;
  title: string;
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
  categorie: string | null;
  lieu: string | null;
  adresse: string | null;
  itineraryLink: string | null;
  rendezVous: string | null;
  seriesId: string | null;
  confirmed: boolean | null;
  cancelled: boolean;
}

interface PlanningStats {
  total: number;
  upcoming: number;
  past: number;
  pending: number;
  accepted: number;
  declined: number;
  officiel: number;
  amical: number;
  entrainement: number;
  plateau: number;
}

interface PlanningResponse {
  assignments: PersonalAssignment[];
  stats: PlanningStats;
}

const declineLabels: Record<DeclineReason, string> = {
  work: 'Travail',
  injury: 'Blessure / santé',
  travel: 'Voyage / déplacement',
  other_assignment: 'Autre affectation',
  personal: 'Contrainte personnelle',
  other: 'Autre',
};

/**
 * Utilise le fuseau horaire du club, comme les règles serveur (`eventStartTimestamp`) :
 * reconstruire la date dans le fuseau du navigateur ferait apparaître/disparaître les
 * actions Accepter/Refuser à un instant différent de celui appliqué par l'API pour un
 * utilisateur connecté depuis un autre fuseau (issue #90).
 */
function eventTimestamp(item: PersonalAssignment, timeZone: string): number {
  return eventStartTimestamp(item.date, item.time, timeZone) ?? 0;
}

function statusBadge(status: AssignmentStatus) {
  if (status === 'accepted') return <StatusPill tone="success">Acceptée</StatusPill>;
  if (status === 'declined') return <StatusPill tone="danger">Refusée</StatusPill>;
  return <StatusPill tone="pending">En attente</StatusPill>;
}

function typeLabel(type: EventType): string {
  if (type === 'officiel') return 'Match officiel';
  if (type === 'amical') return 'Match amical';
  if (type === 'entrainement') return 'Entraînement';
  return 'Plateau';
}

function roleLabel(role: PersonalAssignment['role']): string {
  if (role === 'arbitre') return 'Arbitre club';
  if (role === 'accompagnateur') return 'Accompagnateur';
  return 'Encadrant';
}

export default function MonPlanningPage() {
  const router = useRouter();
  const { settings } = useAppSettings();
  const timeZone = settings.timeZone;
  const [data, setData] = useState<PlanningResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [declines, setDeclines] = useState<Record<string, { reason: DeclineReason; comment: string }>>({});

  const load = useCallback(async () => {
    try {
      setData(await apiGet<PlanningResponse>('/api/me/planning'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger votre planning');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const { upcoming, history } = useMemo(() => {
    // Bascule à la journée près (fuseau du club) : un événement du jour reste dans
    // « Prochaines affectations » jusqu'à la fin de la journée et ne passe dans
    // « Historique » qu'à partir du lendemain, même s'il est déjà terminé.
    const startOfToday = zonedDayStart(Date.now(), timeZone);
    const dayStart = (item: PersonalAssignment) => eventStartTimestamp(item.date, '00:00', timeZone) ?? 0;
    const all = data?.assignments ?? [];
    return {
      upcoming: all.filter((item) => dayStart(item) >= startOfToday),
      history: all.filter((item) => dayStart(item) < startOfToday).reverse(),
    };
  }, [data, timeZone]);

  const respond = async (item: PersonalAssignment, status: 'accepted' | 'declined') => {
    setResponding(item.assignmentId);
    const decline = declines[item.assignmentId] ?? { reason: 'personal' as const, comment: '' };
    try {
      await apiPost('/api/me/assignments/respond', {
        eventId: item.eventId,
        eventType: item.eventType,
        role: item.role,
        status,
        declineReason: status === 'declined' ? decline.reason : undefined,
        declineComment: status === 'declined' ? decline.comment : undefined,
      });
      toast.success(status === 'accepted' ? 'Affectation acceptée' : 'Affectation refusée');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d’enregistrer votre réponse');
    } finally {
      setResponding(null);
    }
  };

  const renderAssignment = (item: PersonalAssignment) => {
    const decline = declines[item.assignmentId] ?? { reason: 'personal' as const, comment: '' };
    // Issue #43 : dès le coup d'envoi, la confirmation est figée — on masque les actions
    // Accepter/Refuser et on bascule vers la présence / le rapport post-événement. Le
    // serveur applique la même règle avec le fuseau horaire du club.
    const startTs = eventTimestamp(item, timeZone);
    const started = startTs > 0 && startTs <= Date.now();
    // Affectation acceptée : la carte entière devient un lien vers l'espace événement
    // (itinéraire, présence, collaboration), sans boutons d'action redondants.
    const isAccepted = !item.cancelled && item.status === 'accepted';
    const openWorkspace = () => router.push(personalEventWorkspaceHref(item.eventType, item.eventId));
    return (
      <Card
        key={item.assignmentId}
        role={isAccepted ? 'link' : undefined}
        tabIndex={isAccepted ? 0 : undefined}
        aria-label={isAccepted ? 'Ouvrir l’espace événement' : undefined}
        onClick={isAccepted ? (event) => { if (!isInteractiveTarget(event.target)) openWorkspace(); } : undefined}
        onKeyDown={isAccepted ? (event) => { if (event.key === 'Enter' && event.target === event.currentTarget) openWorkspace(); } : undefined}
        className={isAccepted ? 'cursor-pointer transition-colors hover:border-primary/40 hover:bg-secondary-soft' : undefined}
      >
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Badge variant="brand">{typeLabel(item.eventType)}</Badge>
                {(item.roles?.length ? item.roles : [item.role]).map((role) => (
                  <Badge key={role} variant="secondary">Ma fonction : {roleLabel(role)}</Badge>
                ))}
                {item.cancelled ? <Badge variant="destructive">Annulé</Badge> : statusBadge(item.status)}
              </div>
              <CardTitle className="text-lg">
                <TeamMatchup
                  localTeam={item.localTeam}
                  awayTeam={item.awayTeam}
                  localTeamLogo={item.localTeamLogo}
                  awayTeamLogo={item.awayTeamLogo}
                  logoSize={24}
                  fallbackTitle={item.title}
                />
              </CardTitle>
              <CardDescription>{item.categorie || 'Sans catégorie'}</CardDescription>
            </div>
            <div className="text-right text-sm"><p className="font-semibold">{item.date}</p><p className="text-muted-foreground">{item.time}</p></div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {item.rendezVous && <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" /> RDV {item.rendezVous}</p>}
            {item.lieu && <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-muted-foreground" /> {item.lieu}</p>}
            {item.adresse && <p className="text-muted-foreground sm:col-span-2">{item.adresse}</p>}
          </div>
          {item.cancelled && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">Cet événement a été annulé par le responsable du planning. Aucune action n’est plus possible.</p>
          )}
          {!item.cancelled && started && (
            <p className="rounded-md border p-2 text-xs text-muted-foreground">Cet événement a déjà commencé : les réponses sont closes. La présence et le rapport post-événement se gèrent depuis l’espace événement.</p>
          )}
          {!item.cancelled && item.status === 'declined' && item.declineReason && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">Motif : {declineLabels[item.declineReason]}{item.declineComment ? ` — ${item.declineComment}` : ''}</p>
          )}
          {!item.cancelled && !started && item.status === 'pending' && (
            <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
              <select className="rounded-md border bg-background px-3 py-2 text-sm" value={decline.reason} onChange={(event) => setDeclines((current) => ({ ...current, [item.assignmentId]: { ...decline, reason: event.target.value as DeclineReason } }))}>
                {Object.entries(declineLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input className="rounded-md border bg-background px-3 py-2 text-sm" placeholder="Commentaire de refus (optionnel)" value={decline.comment} onChange={(event) => setDeclines((current) => ({ ...current, [item.assignmentId]: { ...decline, comment: event.target.value } }))} />
            </div>
          )}
          {isAccepted ? (
            <p className="text-xs text-muted-foreground">Cliquez sur la carte pour ouvrir l’espace événement (itinéraire, présence, collaboration).</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {item.itineraryLink && <Button variant="outline" size="sm" asChild><a href={item.itineraryLink} target="_blank" rel="noreferrer">Itinéraire</a></Button>}
              {!item.cancelled && !started && item.status !== 'accepted' && <Button size="sm" onClick={() => respond(item, 'accepted')} disabled={responding === item.assignmentId}><Check className="mr-2 h-4 w-4" /> Accepter</Button>}
              {!item.cancelled && !started && item.status !== 'declined' && <Button variant="destructive" size="sm" onClick={() => respond(item, 'declined')} disabled={responding === item.assignmentId}><X className="mr-2 h-4 w-4" /> Refuser</Button>}
              <Button variant="outline" size="sm" asChild><Link href={personalEventWorkspaceHref(item.eventType, item.eventId)}>Détails & collaboration</Link></Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <Header onScrapeComplete={() => undefined} />
      <main className="container mx-auto max-w-6xl px-3 py-5 sm:px-4 sm:py-8">
        <PageHeader
          className="mb-6"
          icon={<CalendarDays />}
          title="Mon planning"
          description="Vos affectations, réponses, historique et informations opérationnelles."
          actions={
            <>
              <Button variant="outline" asChild><Link href="/mon-planning/mon-calendrier">Ajouter à mon calendrier</Link></Button>
              <Button variant="outline" asChild><Link href="/mon-planning/disponibilites">Demandes de disponibilité</Link></Button>
              <Button variant="outline" asChild><Link href="/mon-planning/mes-indisponibilites">Mes indisponibilités</Link></Button>
              <Button variant="outline" asChild><Link href="/mon-planning/preferences-planning">Mes préférences</Link></Button>
            </>
          }
        />

        {loading ? <LoadingSpinner size={44} text="Chargement de votre planning..." className="py-20" /> : !data ? null : (
          <>
            <div className="mb-7 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {[
                ['À venir', data.stats.upcoming], ['Historique', data.stats.past], ['En attente', data.stats.pending],
                ['Acceptées', data.stats.accepted], ['Refusées', data.stats.declined], ['Total', data.stats.total],
              ].map(([label, value]) => <StatCard key={String(label)} label={label} value={value} />)}
            </div>
            <section className="mb-8"><h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary"><CalendarDays className="h-4 w-4" /></span> Prochaines affectations</h3>{upcoming.length ? <div className="grid gap-3 lg:grid-cols-2">{upcoming.map(renderAssignment)}</div> : <Card><CardContent className="py-10 text-center text-muted-foreground">Aucune affectation à venir.</CardContent></Card>}</section>
            <section><h3 className="mb-3 flex items-center gap-2 text-lg font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary-soft text-primary"><History className="h-4 w-4" /></span> Historique</h3>{history.length ? <div className="grid gap-3 lg:grid-cols-2">{history.map(renderAssignment)}</div> : <Card><CardContent className="py-10 text-center text-foreground">Aucun historique pour le moment.</CardContent></Card>}</section>
          </>
        )}
      </main>
    </div>
  );
}
