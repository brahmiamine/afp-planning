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
    <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-muted rounded-lg space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base sm:text-lg font-semibold text-foreground">Filtres</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 sm:h-8 text-xs"
          >
            <X className="w-3 h-3 mr-1" />
            <span className="hidden sm:inline">Réinitialiser</span>
            <span className="sm:hidden">Reset</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
          <label className="text-xs sm:text-sm font-medium text-foreground">Lieu</label>
          <div className="flex gap-1.5 sm:gap-2">
            <Button
              variant={filters.venue === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'all')}
              className="flex-1 text-xs"
            >
              Tous
            </Button>
            <Button
              variant={filters.venue === 'domicile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'domicile')}
              className="flex-1 text-xs"
            >
              <Home className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" />
              <span className="hidden sm:inline">Domicile</span>
              <span className="sm:hidden">Dom.</span>
            </Button>
            <Button
              variant={filters.venue === 'extérieur' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'extérieur')}
              className="flex-1 text-xs"
            >
              <Plane className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" />
              <span className="hidden sm:inline">Extérieur</span>
              <span className="sm:hidden">Ext.</span>
            </Button>
          </div>
        </div>

        {/* Filtre par statut complété */}
        <div className="space-y-2">
          <label className="text-xs sm:text-sm font-medium text-foreground">Statut</label>
          <div className="flex gap-1.5 sm:gap-2">
            <Button
              variant={filters.completed === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'all')}
              className="flex-1 text-xs"
            >
              Tous
            </Button>
            <Button
              variant={filters.completed === 'completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'completed')}
              className="flex-1 text-xs"
            >
              <CheckCircle2 className="w-3 h-3 sm:w-4 sm:h-4 mr-0.5 sm:mr-1" />
              <span className="hidden sm:inline">Complété</span>
              <span className="sm:hidden">OK</span>
            </Button>
            <Button
              variant={filters.completed === 'not-completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'not-completed')}
              className="flex-1 text-xs"
            >
              <span className="hidden sm:inline">Non complété</span>
              <span className="sm:hidden">Non</span>
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
