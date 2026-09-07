'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, History, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/app/components/ui/badge';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { LoadingSpinner } from '@/app/components/ui/loading-spinner';
import { apiGet } from '@/lib/utils/api';
import { eventWorkspaceHref, type PlanningEventLinkType } from '@/lib/planning/event-links';
import { TeamMatchup } from '@/app/components/matches/TeamMatchup';
import { toast } from 'sonner';

interface HistoryItem {
  id: number;
  entityType: string;
  entityId: string;
  action: string;
  title: string;
  actor: string;
  createdAt: string;
  eventLabel: string | null;
  eventType: PlanningEventLinkType | null;
  eventDate: string | null;
  localTeam?: string;
  awayTeam?: string;
  localTeamLogo?: string;
  awayTeamLogo?: string;
  sourceOverrideSummary: string | null;
}

const ACTION_OPTIONS = [
  ['all', 'Toutes les actions'],
  ['create', 'Création'],
  ['update', 'Modification'],
  ['delete', 'Suppression'],
  ['attendance', 'Présence'],
  ['auto-assign', 'Affectation automatique'],
  ['publish', 'Publication'],
  ['draft', 'Passage en brouillon'],
  ['cancel', 'Annulation'],
  ['reopen', 'Réouverture'],
  ['manual-reminder', 'Relance'],
] as const;

const ENTITY_OPTIONS = [
  ['all', 'Tous les types'],
  ['MatchOfficial', 'Match officiel'],
  ['MatchAmical', 'Match amical'],
  ['MatchExtra', 'Affectations'],
  ['Entrainement', 'Entraînement'],
  ['Plateau', 'Plateau'],
  ['PlanningAssignment', 'Affectation (planning)'],
  ['PlanningPublication', 'Publication'],
  ['PlanningReminder', 'Relance'],
  ['PlanningAttendance', 'Présence'],
  ['PlanningResource', 'Ressource / transport'],
  ['PlanningCollaboration', 'Collaboration'],
  ['PlanningReport', 'Rapport'],
  ['PlanningProductivity', 'Productivité'],
  ['AssignmentSwap', 'Échange'],
  ['ChatChannel', 'Discussion'],
] as const;

function actionVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (action === 'delete' || action === 'cancel') return 'destructive';
  if (action === 'create' || action === 'publish' || action === 'reopen') return 'default';
  if (action === 'auto-assign' || action === 'attendance' || action === 'manual-reminder') return 'secondary';
  return 'outline';
}

/** `title` a la forme "Action · Type — Libellé" ; on en extrait Action et Type. */
function splitTitle(title: string): { action: string; entity: string } {
  const [action = title, rest = ''] = title.split(' · ');
  const entity = rest.split(' — ')[0] ?? '';
  return { action, entity };
}

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

export default function PlanningHistoriquePage() {
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [entityFilter, setEntityFilter] = useState<string>('all');

  const load = useCallback(async () => {
    try {
      const { history } = await apiGet<{ history: HistoryItem[] }>('/api/planning/historique');
      setHistory(history);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger l\'historique');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    if (!history) return [];
    const query = search.trim().toLowerCase();
    return history.filter((item) => {
      if (actionFilter !== 'all' && item.action !== actionFilter) return false;
      if (entityFilter !== 'all' && item.entityType !== entityFilter) return false;
      if (query) {
        const haystack = [item.title, item.actor, item.eventLabel, item.entityId, item.localTeam, item.awayTeam]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [history, search, actionFilter, entityFilter]);

  const hasFilters = search.trim() !== '' || actionFilter !== 'all' || entityFilter !== 'all';

  const resetFilters = () => {
    setSearch('');
    setActionFilter('all');
    setEntityFilter('all');
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-2xl font-bold"><History className="h-6 w-6" /> Historique lisible</h2>
        <p className="text-sm text-muted-foreground">Les 100 dernières actions effectuées sur le planning.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher (équipe, personne...)"
            className="pl-9"
          />
        </div>
        <select aria-label="Filtrer par action" className={selectClass} value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          {ACTION_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="Filtrer par type" className={selectClass} value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
          {ENTITY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser
          </Button>
        )}
        {history && (
          <span className="text-sm text-muted-foreground sm:ml-auto">
            {filtered.length} / {history.length} action(s)
          </span>
        )}
      </div>

      {loading ? (
        <LoadingSpinner size={44} text="Chargement de l'historique..." className="py-20" />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Quand</th>
                <th className="p-3 font-medium">Action</th>
                <th className="p-3 font-medium">Type</th>
                <th className="p-3 font-medium">Événement</th>
                <th className="p-3 font-medium">Par</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((item) => {
                const { action, entity } = splitTitle(item.title);
                const [, idPart] = item.entityId.split(':');
                const eventId = idPart ?? item.entityId;
                const hasTeams = Boolean(item.localTeam || item.awayTeam);
                return (
                  <tr key={item.id} className="border-t align-top">
                    <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="p-3">
                      <Badge variant={actionVariant(item.action)}>{action}</Badge>
                    </td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{entity || '—'}</td>
                    <td className="p-3">
                      {item.eventType && (hasTeams || item.eventLabel) ? (
                        <Link
                          href={eventWorkspaceHref(item.eventType, eventId)}
                          className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                        >
                          {hasTeams ? (
                            <TeamMatchup
                              localTeam={item.localTeam}
                              awayTeam={item.awayTeam}
                              localTeamLogo={item.localTeamLogo}
                              awayTeamLogo={item.awayTeamLogo}
                              separator="–"
                              logoSize={18}
                              fallbackTitle={item.eventLabel ?? ''}
                              nameClassName="text-primary"
                            />
                          ) : (
                            item.eventLabel
                          )}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{item.entityId}</span>
                      )}
                      {item.eventDate && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CalendarDays className="h-3.5 w-3.5" /> Événement du {item.eventDate}
                        </p>
                      )}
                      {item.sourceOverrideSummary && (
                        <p className="mt-1 text-xs font-medium text-foreground">
                          {item.sourceOverrideSummary}
                        </p>
                      )}
                    </td>
                    <td className="whitespace-nowrap p-3 text-xs text-muted-foreground">{item.actor}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-sm text-muted-foreground">
                    {hasFilters ? 'Aucune action ne correspond aux filtres.' : 'Aucun historique disponible.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
