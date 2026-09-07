'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bookmark, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiDelete, apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';
import type { MatchFilters } from '@/components/matches/MatchFilters';

interface SavedFilter {
  id: string;
  name: string;
  filters: MatchFilters;
}

interface SavedFiltersBarProps {
  currentFilters: MatchFilters;
  onApply: (filters: MatchFilters) => void;
}

const hasActiveFilters = (filters: MatchFilters) =>
  filters.clubSearch !== '' || filters.arbitreAFPSearch !== '' || filters.venue !== 'all' || filters.eventType !== 'all';

/** Filtres nommés, enregistrés par l'utilisateur courant et rappelables (issue #189). */
export function SavedFiltersBar({ currentFilters, onApply }: SavedFiltersBarProps) {
  const [savedFilters, setSavedFilters] = useState<SavedFilter[]>([]);
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<{ filters: SavedFilter[] }>('/api/planning/saved-filters');
      setSavedFilters(data.filters);
    } catch {
      // Les filtres enregistrés sont une commodité : une panne de chargement ne doit pas
      // bloquer l'usage des filtres eux-mêmes.
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setIsSaving(true);
    try {
      await apiPost('/api/planning/saved-filters', { name: trimmed, filters: currentFilters });
      toast.success('Filtre enregistré');
      setName('');
      setIsNaming(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible d’enregistrer ce filtre');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiDelete(`/api/planning/saved-filters?id=${encodeURIComponent(id)}`);
      setSavedFilters((current) => current.filter((item) => item.id !== id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de supprimer ce filtre');
    }
  };

  if (!savedFilters.length && !isNaming && !hasActiveFilters(currentFilters)) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {savedFilters.map((item) => (
        <Badge key={item.id} variant="outline" className="flex items-center gap-1 py-1 pl-2 pr-1 text-xs">
          <button type="button" className="flex items-center gap-1 hover:underline" onClick={() => onApply(item.filters)}>
            <Bookmark className="h-3 w-3" /> {item.name}
          </button>
          <button
            type="button"
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => handleDelete(item.id)}
            aria-label={`Supprimer le filtre ${item.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}

      {isNaming ? (
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') void handleSave(); if (event.key === 'Escape') setIsNaming(false); }}
            placeholder="Nom du filtre"
            className="h-7 w-40 text-xs"
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={isSaving || !name.trim()}>Enregistrer</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setIsNaming(false); setName(''); }}>Annuler</Button>
        </div>
      ) : (
        hasActiveFilters(currentFilters) && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => setIsNaming(true)}>
            <Plus className="h-3 w-3" /> Enregistrer ce filtre
          </Button>
        )
      )}
    </div>
  );
}
