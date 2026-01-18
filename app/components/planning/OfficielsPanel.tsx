'use client';

import { useState, memo, useCallback, useMemo } from 'react';
import { useOfficiels } from '@/hooks/useOfficiels';
import { OfficielCard } from './OfficielCard';
import { OfficielCardWithPopover } from './OfficielCardWithPopover';
import { AddOfficielDialog } from '@/components/ui/add-officiel-dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, Search, UserPlus } from 'lucide-react';
import { apiPut, apiDelete } from '@/lib/utils/api';
import { toast } from 'sonner';
import { Match, Entrainement, Plateau } from '@/types/match';

type Event = Match | Entrainement | Plateau;

interface OfficielsPanelProps {
  className?: string;
  events?: Record<string, Event[]>;
  onEventUpdate?: () => void;
}

export const OfficielsPanel = memo(function OfficielsPanel({
  className,
  events = {},
  onEventUpdate,
}: OfficielsPanelProps) {
  const { officiels, reload, isLoading } = useOfficiels();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deletingNom, setDeletingNom] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const filteredOfficiels = useMemo(() => {
    if (!searchQuery.trim()) {
      return officiels;
    }
    const query = searchQuery.toLowerCase().trim();
    return officiels.filter((officiel) =>
      officiel.nom.toLowerCase().includes(query)
    );
  }, [officiels, searchQuery]);

  const handleAddOfficiel = useCallback(
    async (nom: string, telephone: string) => {
      try {
        await apiPut('/api/officiels', { nom, telephone });
        reload();
        toast.success('Officiel ajouté avec succès');
      } catch (error) {
        console.error('Error adding officiel:', error);
        toast.error('Erreur lors de l\'ajout de l\'officiel');
        throw error;
      }
    },
    [reload]
  );

  const handleDeleteOfficiel = useCallback(
    async (nom: string) => {
      if (!window.confirm(`Êtes-vous sûr de vouloir supprimer l'officiel "${nom}" ?`)) {
        return;
      }

      setDeletingNom(nom);
      try {
        await apiDelete(`/api/officiels?nom=${encodeURIComponent(nom)}`);
        reload();
        toast.success('Officiel supprimé avec succès');
      } catch (error) {
        console.error('Error deleting officiel:', error);
        toast.error('Erreur lors de la suppression de l\'officiel');
      } finally {
        setDeletingNom(null);
      }
    },
    [reload]
  );

  return (
    <div className={className}>
      <Card className="h-full flex flex-col">
        <div className="p-4 border-b">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Officiels</h2>
            <Button
              size="sm"
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Rechercher un officiel..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Cliquez sur un officiel ou utilisez le bouton <UserPlus className="inline h-3 w-3" /> pour affecter rapidement
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredOfficiels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery ? 'Aucun officiel trouvé' : 'Aucun officiel. Cliquez sur "Ajouter" pour en créer un.'}
            </div>
          ) : (
            filteredOfficiels.map((officiel) => {
              if (onEventUpdate) {
                return (
                  <OfficielCardWithPopover
                    key={officiel.nom}
                    officiel={officiel}
                    events={events}
                    onDelete={handleDeleteOfficiel}
                    isDeleting={deletingNom === officiel.nom}
                    onEventUpdate={onEventUpdate}
                  />
                );
              }
              return (
                <OfficielCard
                  key={officiel.nom}
                  officiel={officiel}
                  onDelete={handleDeleteOfficiel}
                  isDeleting={deletingNom === officiel.nom}
                />
              );
            })
          )}
        </div>
      </Card>

      <AddOfficielDialog
        open={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onAdd={handleAddOfficiel}
      />
    </div>
  );
});
