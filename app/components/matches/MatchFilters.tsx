'use client';

import { Search, X, Home, Plane, CheckCircle2, Gamepad2, Dumbbell, Trophy, Calendar } from 'lucide-react';
import { memo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface MatchFilters {
  clubSearch: string;
  arbitreAFPSearch: string;
  venue: 'all' | 'domicile' | 'extérieur';
  completed: 'all' | 'completed' | 'not-completed';
  eventType: 'all' | 'officiel' | 'amical' | 'entrainement' | 'plateau';
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
      eventType: 'all',
    });
  };

  const hasActiveFilters =
    filters.clubSearch !== '' ||
    filters.arbitreAFPSearch !== '' ||
    filters.venue !== 'all' ||
    filters.completed !== 'all' ||
    filters.eventType !== 'all';

  return (
    <div className="mb-4 sm:mb-6 p-3 sm:p-4 lg:p-5 bg-muted rounded-lg space-y-3 sm:space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm sm:text-base lg:text-lg font-semibold text-foreground">Filtres</h3>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-7 sm:h-8 text-[10px] sm:text-xs"
          >
            <X className="w-3 h-3 sm:w-3.5 sm:h-3.5 mr-1" />
            <span className="hidden sm:inline">Réinitialiser</span>
            <span className="sm:hidden">Reset</span>
          </Button>
        )}
      </div>

      {/* Recherches */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {/* Recherche par club */}
        <div className="space-y-1.5">
          <label className="text-xs sm:text-sm font-medium text-foreground">Rechercher par club</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nom du club..."
              value={filters.clubSearch}
              onChange={(e) => updateFilter('clubSearch', e.target.value)}
              className="pl-9 sm:pl-10 h-8 sm:h-9 md:h-10 text-xs sm:text-sm"
            />
          </div>
        </div>

        {/* Recherche par arbitre AFP */}
        <div className="space-y-1.5">
          <label className="text-xs sm:text-sm font-medium text-foreground">Rechercher par arbitre AFP</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Nom de l'arbitre AFP..."
              value={filters.arbitreAFPSearch}
              onChange={(e) => updateFilter('arbitreAFPSearch', e.target.value)}
              className="pl-9 sm:pl-10 h-8 sm:h-9 md:h-10 text-xs sm:text-sm"
            />
          </div>
        </div>
      </div>

      {/* Filtres de sélection */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-5">
        {/* Filtre par venue */}
        <div className="space-y-2">
          <label className="text-xs sm:text-sm font-medium text-foreground">Lieu</label>
          <div className="flex gap-1.5 sm:gap-2">
            <Button
              variant={filters.venue === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'all')}
              className="flex-1 h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-2 sm:px-3"
            >
              Tous
            </Button>
            <Button
              variant={filters.venue === 'domicile' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'domicile')}
              className="flex-1 h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2.5"
            >
              <Home className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden sm:inline">Domicile</span>
              <span className="sm:hidden">Dom.</span>
            </Button>
            <Button
              variant={filters.venue === 'extérieur' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('venue', 'extérieur')}
              className="flex-1 h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2.5"
            >
              <Plane className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
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
              className="flex-1 h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-2 sm:px-3"
            >
              Tous
            </Button>
            <Button
              variant={filters.completed === 'completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'completed')}
              className="flex-1 h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2.5"
            >
              <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden sm:inline">Complété</span>
              <span className="sm:hidden">OK</span>
            </Button>
            <Button
              variant={filters.completed === 'not-completed' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('completed', 'not-completed')}
              className="flex-1 h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2.5"
            >
              <span className="hidden sm:inline">Non complété</span>
              <span className="sm:hidden">Non</span>
            </Button>
          </div>
        </div>

        {/* Filtre par type d'événement */}
        <div className="space-y-2">
          <label className="text-xs sm:text-sm font-medium text-foreground">Type</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:flex lg:gap-1.5 gap-1.5">
            <Button
              variant={filters.eventType === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('eventType', 'all')}
              className="h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2"
              title="Tous les types"
            >
              <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden lg:inline">Tous</span>
              <span className="lg:hidden">Tous</span>
            </Button>
            <Button
              variant={filters.eventType === 'officiel' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('eventType', 'officiel')}
              className="h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2"
              title="Match officiel"
            >
              <Gamepad2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden xl:inline">Officiel</span>
              <span className="xl:hidden">Off.</span>
            </Button>
            <Button
              variant={filters.eventType === 'amical' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('eventType', 'amical')}
              className="h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2"
              title="Match amical"
            >
              <Gamepad2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden xl:inline">Amical</span>
              <span className="xl:hidden">Amic.</span>
            </Button>
            <Button
              variant={filters.eventType === 'entrainement' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('eventType', 'entrainement')}
              className="h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2"
              title="Entraînement"
            >
              <Dumbbell className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden xl:inline">Entrain.</span>
              <span className="xl:hidden">Entr.</span>
            </Button>
            <Button
              variant={filters.eventType === 'plateau' ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('eventType', 'plateau')}
              className="h-7 sm:h-8 md:h-9 text-[10px] sm:text-xs md:text-sm px-1.5 sm:px-2"
              title="Plateau"
            >
              <Trophy className="w-3 h-3 sm:w-3.5 sm:h-3.5 md:w-4 md:h-4 mr-0.5 sm:mr-1 shrink-0" />
              <span className="hidden xl:inline">Plateau</span>
              <span className="xl:hidden">Plat.</span>
            </Button>
          </div>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 pt-3 sm:pt-4 border-t border-border">
          <span className="text-xs sm:text-sm text-muted-foreground font-medium">Filtres actifs:</span>
          {filters.clubSearch && (
            <Badge variant="secondary" className="text-xs sm:text-sm py-1 sm:py-1.5">
              Club: {filters.clubSearch}
            </Badge>
          )}
          {filters.arbitreAFPSearch && (
            <Badge variant="secondary" className="text-xs sm:text-sm py-1 sm:py-1.5">
              Arbitre AFP: {filters.arbitreAFPSearch}
            </Badge>
          )}
          {filters.venue !== 'all' && (
            <Badge variant="secondary" className="text-xs sm:text-sm py-1 sm:py-1.5">
              {filters.venue === 'domicile' ? '🏠 Domicile' : '✈️ Extérieur'}
            </Badge>
          )}
          {filters.completed !== 'all' && (
            <Badge variant="secondary" className="text-xs sm:text-sm py-1 sm:py-1.5">
              {filters.completed === 'completed' ? '✓ Complété' : '✗ Non complété'}
            </Badge>
          )}
          {filters.eventType !== 'all' && (
            <Badge variant="secondary" className="text-xs sm:text-sm py-1 sm:py-1.5">
              Type: {filters.eventType === 'officiel' ? '⚽ Officiel' : filters.eventType === 'amical' ? '🤝 Amical' : filters.eventType === 'entrainement' ? '💪 Entraînement' : '🏆 Plateau'}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
});
