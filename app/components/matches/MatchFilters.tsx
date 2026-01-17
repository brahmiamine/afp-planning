'use client';

import { Search, X, Home, Plane, CheckCircle2 } from 'lucide-react';
import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface MatchFilters {
  clubSearch: string;
  arbitreAFPSearch: string;
  venue: 'all' | 'domicile' | 'extérieur';
  completed: 'all' | 'completed' | 'not-completed';
}

interface MatchFiltersProps {
  filters: MatchFilters;
  onFiltersChange: (filters: MatchFilters) => void;
}

export const MatchFilters = memo(function MatchFilters({
  filters,
  onFiltersChange,
}: MatchFiltersProps) {
  const updateFilter = <K extends keyof MatchFilters>(key: K, value: MatchFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      clubSearch: '',
      arbitreAFPSearch: '',
      venue: 'all',
      completed: 'all',
    });
  };

  const hasActiveFilters =
    filters.clubSearch !== '' ||
    filters.arbitreAFPSearch !== '' ||
    filters.venue !== 'all' ||
    filters.completed !== 'all';

  return (
    <div className="mb-6 p-4 bg-muted rounded-lg space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Filtres</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-8 text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            Réinitialiser
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Recherche par club */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Rechercher par club</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nom du club..."
              value={filters.clubSearch}
              onChange={(e) => updateFilter('clubSearch', e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Recherche par arbitre AFP */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Rechercher par arbitre AFP</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nom de l'arbitre AFP..."
              value={filters.arbitreAFPSearch}
              onChange={(e) => updateFilter('arbitreAFPSearch', e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {/* Filtre par venue */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Lieu</label>
          <div className="flex gap-2">
            <Button
              variant={filters.venue === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'all')}
              className="flex-1"
            >
              Tous
            </Button>
            <Button
              variant={filters.venue === 'domicile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'domicile')}
              className="flex-1"
            >
              <Home className="w-4 h-4 mr-1" />
              Domicile
            </Button>
            <Button
              variant={filters.venue === 'extérieur' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'extérieur')}
              className="flex-1"
            >
              <Plane className="w-4 h-4 mr-1" />
              Extérieur
            </Button>
          </div>
        </div>

        {/* Filtre par statut complété */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Statut</label>
          <div className="flex gap-2">
            <Button
              variant={filters.completed === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'all')}
              className="flex-1"
            >
              Tous
            </Button>
            <Button
              variant={filters.completed === 'completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'completed')}
              className="flex-1"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              Complété
            </Button>
            <Button
              variant={filters.completed === 'not-completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'not-completed')}
              className="flex-1"
            >
              Non complété
            </Button>
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">Filtres actifs:</span>
          {filters.clubSearch && (
            <Badge variant="secondary" className="text-xs">
              Club: {filters.clubSearch}
            </Badge>
          )}
          {filters.arbitreAFPSearch && (
            <Badge variant="secondary" className="text-xs">
              Arbitre AFP: {filters.arbitreAFPSearch}
            </Badge>
          )}
          {filters.venue !== 'all' && (
            <Badge variant="secondary" className="text-xs">
              {filters.venue === 'domicile' ? '🏠 Domicile' : '✈️ Extérieur'}
            </Badge>
          )}
          {filters.completed !== 'all' && (
            <Badge variant="secondary" className="text-xs">
              {filters.completed === 'completed' ? '✓ Complété' : '✗ Non complété'}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
});
