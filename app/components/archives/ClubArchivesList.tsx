'use client';

import { useMemo, useState } from 'react';
import { Archive } from 'lucide-react';
import {
  DataCell,
  DataList,
  DataRow,
  PageContainer,
  PageHeader,
  SectionCard,
  StatusPill,
  type StatusTone,
} from '@/app/components/layout/page-primitives';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { TeamMatchup } from '@/app/components/matches/TeamMatchup';
import {
  ARCHIVE_BADGE_LABELS,
  filterOfficialArchives,
  type ArchiveBadge,
  type OfficialArchiveRow,
} from '@/lib/archives/official-matches';
import { formatDateFrench } from '@/lib/utils/date';

const BADGE_TONE: Record<ArchiveBadge, StatusTone> = {
  past: 'neutral',
  missing: 'warning',
  cancelled: 'danger',
};

const COLUMNS = 'minmax(7rem,0.8fr) minmax(12rem,1.6fr) minmax(8rem,1.1fr) minmax(6rem,0.8fr) minmax(8rem,1fr) auto';

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );
}

function venueLabel(venue: OfficialArchiveRow['venue']): string {
  return venue === 'extérieur' ? 'Extérieur' : 'Domicile';
}

export function ClubArchivesList({ items }: { items: OfficialArchiveRow[] }) {
  const [query, setQuery] = useState('');
  const [year, setYear] = useState('all');
  const [badge, setBadge] = useState<ArchiveBadge | 'all'>('all');
  const [categorie, setCategorie] = useState('all');

  const years = useMemo(
    () => [...new Set(items.map((item) => item.year).filter((value): value is string => Boolean(value)))].sort().reverse(),
    [items],
  );
  const categories = useMemo(
    () => [...new Set(items.map((item) => item.categorie).filter((value): value is string => Boolean(value)))].sort(),
    [items],
  );

  const visible = useMemo(
    () => filterOfficialArchives(items, { query, year, badge, categorie }),
    [items, query, year, badge, categorie],
  );

  return (
    <PageContainer>
      <PageHeader
        icon={<Archive />}
        title="Archives des matchs"
        description="Matchs passés, annulés, ou confirmés disparus de la source de scraping. La liste active du club n’affiche pas les matchs disparus."
      />

      <SectionCard title="Recherche et filtres" contentClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="archives-search">Équipe ou compétition</Label>
          <Input
            id="archives-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="AFP, Championnat…"
          />
        </div>
        <FilterSelect
          id="archives-year"
          label="Saison / année"
          value={year}
          onChange={setYear}
          options={[{ value: 'all', label: 'Toutes les années' }, ...years.map((value) => ({ value, label: value }))]}
        />
        <FilterSelect
          id="archives-badge"
          label="Statut"
          value={badge}
          onChange={(value) => setBadge(value as ArchiveBadge | 'all')}
          options={[
            { value: 'all', label: 'Tous les statuts' },
            { value: 'past', label: ARCHIVE_BADGE_LABELS.past },
            { value: 'missing', label: ARCHIVE_BADGE_LABELS.missing },
            { value: 'cancelled', label: ARCHIVE_BADGE_LABELS.cancelled },
          ]}
        />
        <FilterSelect
          id="archives-category"
          label="Catégorie"
          value={categorie}
          onChange={setCategorie}
          options={[{ value: 'all', label: 'Toutes les catégories' }, ...categories.map((value) => ({ value, label: value }))]}
        />
      </SectionCard>

      <DataList
        columns={COLUMNS}
        header={(
          <>
            <span>Date</span>
            <span>Rencontre</span>
            <span>Compétition</span>
            <span>Lieu</span>
            <span>Observation source</span>
            <span>Statut</span>
          </>
        )}
        isEmpty={visible.length === 0}
        empty={items.length === 0 ? 'Aucune archive pour ce club.' : 'Aucun résultat pour ces filtres.'}
      >
        {visible.map((row) => (
          <DataRow key={row.id} columns={COLUMNS} href={row.workspaceHref}>
            <DataCell label="Date">
              <p className="font-medium">{row.date}</p>
              <p className="text-xs text-muted-foreground">{row.time}{row.categorie ? ` · ${row.categorie}` : ''}</p>
            </DataCell>
            <DataCell label="Rencontre">
              <TeamMatchup
                localTeam={row.localTeam}
                awayTeam={row.awayTeam}
                localTeamLogo={row.localTeamLogo}
                awayTeamLogo={row.awayTeamLogo}
              />
            </DataCell>
            <DataCell label="Compétition">{row.competition}</DataCell>
            <DataCell label="Lieu">
              <p>{venueLabel(row.venue)}</p>
              {row.stadium && <p className="text-xs text-muted-foreground">{row.stadium}</p>}
            </DataCell>
            <DataCell label="Observation source">
              {row.sourceLastSeenAt
                ? formatDateFrench(row.sourceLastSeenAt)
                : <span className="text-muted-foreground">Non observé</span>}
            </DataCell>
            <DataCell label="Statut">
              <div className="flex flex-wrap gap-1">
                {row.badges.map((item) => (
                  <StatusPill key={item} tone={BADGE_TONE[item]}>{ARCHIVE_BADGE_LABELS[item]}</StatusPill>
                ))}
              </div>
            </DataCell>
          </DataRow>
        ))}
      </DataList>
    </PageContainer>
  );
}
