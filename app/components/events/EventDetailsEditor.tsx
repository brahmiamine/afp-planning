'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiPut } from '@/lib/utils/api';
import type { PlanningEventSnapshot } from '@/lib/planning/event-store';
import type { Match, Plateau } from '@/types/match';
import { toast } from 'sonner';

interface EventDetailsEditorProps {
  snapshot: PlanningEventSnapshot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}

interface FormState {
  date: string;
  time: string;
  durationMinutes: string;
  localTeam: string;
  awayTeam: string;
  competition: string;
  categorie: string;
  categories: string;
  venue: 'domicile' | 'extérieur';
  horaireRendezVous: string;
  lieu: string;
  stadium: string;
  address: string;
  terrainType: string;
  itineraryLink: string;
  referee: string;
  assistant1: string;
  assistant2: string;
}

function initialForm(snapshot: PlanningEventSnapshot): FormState {
  const event = snapshot.event;
  const match = snapshot.eventType === 'officiel' || snapshot.eventType === 'amical'
    ? event as Match
    : null;
  const plateau = snapshot.eventType === 'plateau' ? event as Plateau : null;

  return {
    date: snapshot.date,
    time: snapshot.time,
    durationMinutes: String(snapshot.durationMinutes),
    localTeam: match?.localTeam ?? '',
    awayTeam: match?.awayTeam ?? '',
    competition: match?.competition ?? '',
    categorie: match?.categorie ?? ('categorie' in event ? event.categorie ?? '' : ''),
    categories: plateau?.categories?.join(', ') ?? '',
    venue: match?.venue ?? 'domicile',
    horaireRendezVous: match?.horaireRendezVous ?? '',
    lieu: 'lieu' in event ? event.lieu ?? '' : '',
    stadium: match?.details?.stadium ?? '',
    address: match?.details?.address ?? '',
    terrainType: match?.details?.terrainType ?? '',
    itineraryLink: match?.details?.itineraryLink ?? '',
    referee: match?.staff?.referee ?? '',
    assistant1: match?.staff?.assistant1 ?? '',
    assistant2: match?.staff?.assistant2 ?? '',
  };
}

export function EventDetailsEditor({ snapshot, open, onOpenChange, onSaved }: EventDetailsEditorProps) {
  const [form, setForm] = useState<FormState>(() => initialForm(snapshot));
  const [saving, setSaving] = useState(false);
  const isMatch = snapshot.eventType === 'officiel' || snapshot.eventType === 'amical';

  useEffect(() => {
    if (open) setForm(initialForm(snapshot));
  }, [open, snapshot]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = isMatch
        ? {
            date: form.date,
            time: form.time,
            durationMinutes: Number(form.durationMinutes),
            localTeam: form.localTeam,
            awayTeam: form.awayTeam,
            competition: form.competition,
            categorie: form.categorie,
            venue: form.venue,
            horaireRendezVous: form.horaireRendezVous,
            details: {
              stadium: form.stadium,
              address: form.address,
              terrainType: form.terrainType,
              itineraryLink: form.itineraryLink,
            },
            staff: {
              referee: form.referee,
              assistant1: form.assistant1,
              assistant2: form.assistant2,
            },
          }
        : snapshot.eventType === 'plateau'
          ? {
              date: form.date,
              time: form.time,
              durationMinutes: Number(form.durationMinutes),
              lieu: form.lieu,
              categories: form.categories.split(',').map((item) => item.trim()).filter(Boolean),
            }
          : {
              date: form.date,
              time: form.time,
              durationMinutes: Number(form.durationMinutes),
              lieu: form.lieu,
              categorie: form.categorie,
            };

      await apiPut(`/api/planning/events/${encodeURIComponent(snapshot.eventType)}/${encodeURIComponent(snapshot.eventId)}`, payload);
      toast.success('Informations de l’événement mises à jour');
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Modification impossible');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifier toutes les informations</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="event-date">Date</Label>
              <Input id="event-date" value={form.date} onChange={(event) => update('date', event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-time">Heure</Label>
              <Input id="event-time" value={form.time} onChange={(event) => update('time', event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-duration">Durée (minutes)</Label>
              <Input id="event-duration" type="number" min={1} max={720} value={form.durationMinutes} onChange={(event) => update('durationMinutes', event.target.value)} />
            </div>
          </section>

          {isMatch ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="local-team">Équipe locale</Label><Input id="local-team" value={form.localTeam} onChange={(event) => update('localTeam', event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="away-team">Équipe visiteuse</Label><Input id="away-team" value={form.awayTeam} onChange={(event) => update('awayTeam', event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="competition">Compétition</Label><Input id="competition" value={form.competition} onChange={(event) => update('competition', event.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="category">Catégorie</Label><Input id="category" value={form.categorie} onChange={(event) => update('categorie', event.target.value)} /></div>
                <div className="space-y-2">
                  <Label htmlFor="venue">Domicile / extérieur</Label>
                  <select id="venue" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={form.venue} onChange={(event) => update('venue', event.target.value as FormState['venue'])}>
                    <option value="domicile">Domicile</option>
                    <option value="extérieur">Extérieur</option>
                  </select>
                </div>
                <div className="space-y-2"><Label htmlFor="meeting-time">Heure de rendez-vous</Label><Input id="meeting-time" value={form.horaireRendezVous} onChange={(event) => update('horaireRendezVous', event.target.value)} /></div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold">Stade et déplacement</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2"><Label htmlFor="stadium">Stade</Label><Input id="stadium" value={form.stadium} onChange={(event) => update('stadium', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="address">Adresse</Label><Input id="address" value={form.address} onChange={(event) => update('address', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="terrain">Type de terrain</Label><Input id="terrain" value={form.terrainType} onChange={(event) => update('terrainType', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="itinerary">Lien itinéraire</Label><Input id="itinerary" value={form.itineraryLink} onChange={(event) => update('itineraryLink', event.target.value)} /></div>
                </div>
              </section>

              <section>
                <h3 className="mb-3 text-sm font-semibold">Officiels du match</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2"><Label htmlFor="referee">Arbitre</Label><Input id="referee" value={form.referee} onChange={(event) => update('referee', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="assistant-1">Assistant 1</Label><Input id="assistant-1" value={form.assistant1} onChange={(event) => update('assistant1', event.target.value)} /></div>
                  <div className="space-y-2"><Label htmlFor="assistant-2">Assistant 2</Label><Input id="assistant-2" value={form.assistant2} onChange={(event) => update('assistant2', event.target.value)} /></div>
                </div>
              </section>
            </>
          ) : (
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="event-place">Lieu</Label><Input id="event-place" value={form.lieu} onChange={(event) => update('lieu', event.target.value)} /></div>
              {snapshot.eventType === 'plateau' ? (
                <div className="space-y-2"><Label htmlFor="event-categories">Catégories (séparées par des virgules)</Label><Input id="event-categories" value={form.categories} onChange={(event) => update('categories', event.target.value)} /></div>
              ) : (
                <div className="space-y-2"><Label htmlFor="event-category">Catégorie</Label><Input id="event-category" value={form.categorie} onChange={(event) => update('categorie', event.target.value)} /></div>
              )}
            </section>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Annuler</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer les modifications'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
