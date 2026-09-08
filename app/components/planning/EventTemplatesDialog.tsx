'use client';

import { useCallback, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { apiDelete, apiGet, apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';
import { creationEndpointFor, type DuplicableEventType } from '@/lib/planning/event-duplication';

interface EventTemplate {
  id: string;
  name: string;
  eventType: DuplicableEventType;
  fields: Record<string, unknown>;
}

interface EventTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const TYPE_LABELS: Record<DuplicableEventType, string> = {
  amical: 'Match amical',
  entrainement: 'Entraînement',
  plateau: 'Plateau',
};

function todayFrench(): string {
  const now = new Date();
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
}

/** Liste les modèles d'événements enregistrés et permet d'en créer un brouillon (issue #188). */
export function EventTemplatesDialog({ open, onOpenChange, onCreated }: EventTemplatesDialogProps) {
  const [templates, setTemplates] = useState<EventTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await apiGet<{ templates: EventTemplate[] }>('/api/planning/event-templates');
      setTemplates(data.templates);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de charger les modèles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const handleCreate = async (template: EventTemplate) => {
    setBusyId(template.id);
    try {
      await apiPost(creationEndpointFor(template.eventType), {
        ...template.fields,
        date: todayFrench(),
        time: '10:00',
      });
      toast.success('Événement créé en brouillon depuis le modèle — ajustez la date et l’heure.');
      onCreated();
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de créer l’événement');
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (template: EventTemplate) => {
    setBusyId(template.id);
    try {
      await apiDelete(`/api/planning/event-templates?id=${encodeURIComponent(template.id)}`);
      setTemplates((current) => current.filter((item) => item.id !== template.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Impossible de supprimer ce modèle');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Modèles d’événements</DialogTitle>
          <DialogDescription>
            Créer un brouillon à partir d’un modèle enregistré. La date et l’heure sont à
            ajuster juste après.
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement...</p>
        ) : templates.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucun modèle enregistré. Depuis un événement existant, utilisez « Enregistrer comme modèle ».
          </p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {templates.map((template) => (
              <div key={template.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <Badge variant="outline" className="mt-1">{TYPE_LABELS[template.eventType]}</Badge>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="sm" disabled={busyId === template.id} onClick={() => handleCreate(template)}>Créer</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busyId === template.id}
                    onClick={() => handleDelete(template)}
                    aria-label={`Supprimer le modèle ${template.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
