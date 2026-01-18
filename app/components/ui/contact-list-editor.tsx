'use client';

import { X, Plus, UserPlus } from 'lucide-react';
import { memo, useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OfficielCombobox, Officiel } from '@/components/ui/officiel-combobox';
import { ContactOfficiel } from '@/hooks/useMatchExtras';
import { AddOfficielDialog } from '@/components/ui/add-officiel-dialog';
import { cn } from '@/lib/utils';

interface ContactListEditorProps {
  contacts: ContactOfficiel[];
  officiels: Officiel[];
  onContactsChange: (contacts: ContactOfficiel[]) => void;
  onAddOfficiel?: (nom: string, telephone: string) => Promise<void>;
  placeholder?: string;
  label?: string;
  className?: string;
}

export const ContactListEditor = memo(function ContactListEditor({
  contacts,
  officiels,
  onContactsChange,
  onAddOfficiel,
  placeholder = 'Sélectionner un officiel...',
  label = 'Contact',
  className = '',
}: ContactListEditorProps) {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [pendingOfficiel, setPendingOfficiel] = useState<{ nom: string; telephone: string } | null>(null);
  const prevOfficielsRef = useRef<Officiel[]>([]);

  const addContact = () => {
    onContactsChange([...contacts, { nom: '', numero: '' }]);
  };

  const removeContact = (index: number) => {
    onContactsChange(contacts.filter((_, i) => i !== index));
  };

  const updateContact = (index: number, field: 'nom' | 'numero', value: string) => {
    const updated = [...contacts];
    updated[index] = { 
      nom: updated[index]?.nom || '', 
      numero: updated[index]?.numero || '',
      [field]: value 
    };
    onContactsChange(updated);
  };

  const handleOfficielSelect = (index: number, value: string) => {
    // Recherche insensible à la casse et aux espaces
    const valueTrimmed = value.trim().toLowerCase();
    const selected = officiels.find((o) => {
      const nomTrimmed = o.nom.trim().toLowerCase();
      return nomTrimmed === valueTrimmed;
    });
    const updated = [...contacts];
    updated[index] = {
      nom: value.trim(),
      numero: selected?.telephone || updated[index]?.numero || '',
    };
    onContactsChange(updated);
  };

  // Surveiller les changements dans la liste des officiels pour sélectionner automatiquement
  // un officiel qui vient d'être ajouté
  useEffect(() => {
    if (pendingOfficiel && pendingIndex !== null && pendingIndex < contacts.length) {
      const pendingNomTrimmed = pendingOfficiel.nom.trim().toLowerCase();
      
      // Vérifier si l'officiel était dans la liste précédente
      const wasInPrevList = prevOfficielsRef.current.some((o) => {
        const nomTrimmed = o.nom.trim().toLowerCase();
        return nomTrimmed === pendingNomTrimmed;
      });
      
      // Chercher l'officiel dans la liste actuelle
      const officielFound = officiels.find((o) => {
        const nomTrimmed = o.nom.trim().toLowerCase();
        return nomTrimmed === pendingNomTrimmed;
      });

      // Si l'officiel est maintenant dans la liste mais n'y était pas avant
      if (officielFound && !wasInPrevList) {
        // Mettre à jour le contact avec le nom ET le numéro
        // Le nom sera automatiquement sélectionné dans le dropdown car il existe dans officiels
        const updated = [...contacts];
        if (updated[pendingIndex]) {
          updated[pendingIndex] = {
            nom: pendingOfficiel.nom.trim(),
            numero: pendingOfficiel.telephone.trim(),
          };
          onContactsChange(updated);
        }
        // Réinitialiser l'état pending après la mise à jour
        setPendingOfficiel(null);
        setPendingIndex(null);
      }
    }

    // Toujours mettre à jour la référence de la liste précédente
    prevOfficielsRef.current = officiels;
  }, [officiels, pendingOfficiel, pendingIndex, contacts, onContactsChange]);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm sm:text-base">{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addContact}
          className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          <span className="hidden sm:inline">Ajouter</span>
          <span className="sm:hidden">+</span>
        </Button>
      </div>

      {contacts.length === 0 && (
        <div className="text-center py-3 sm:py-4 text-xs sm:text-sm text-muted-foreground border border-dashed rounded-lg px-2">
          Aucun contact ajouté. Cliquez sur "Ajouter" pour en ajouter un.
        </div>
      )}

      {contacts.map((contact, index) => (
        <div
          key={index}
          className="p-3 sm:p-4 border border-border rounded-lg space-y-3 bg-card"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              {label} #{index + 1}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeContact(index)}
              className="h-7 w-7 sm:h-8 sm:w-8 flex-shrink-0"
            >
              <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-2 min-w-0 flex-1">
              <Label className="text-xs sm:text-sm">Nom</Label>
              <div className="flex gap-2 items-stretch">
                <div className="flex-1 min-w-0 w-full">
                  <OfficielCombobox
                    officiels={officiels}
                    value={contact.nom || ''}
                    onValueChange={(value) => handleOfficielSelect(index, value)}
                    placeholder={placeholder}
                  />
                </div>
                {onAddOfficiel && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setPendingIndex(index);
                      setShowAddDialog(true);
                    }}
                    className="h-auto w-auto px-2 sm:px-3 flex-shrink-0"
                    title="Ajouter un officiel manuellement"
                  >
                    <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2 min-w-0">
              <Label className="text-xs sm:text-sm">Numéro de téléphone</Label>
              <Input
                type="tel"
                value={contact.numero}
                onChange={(e) => updateContact(index, 'numero', e.target.value)}
                placeholder="Numéro de téléphone"
                className="w-full"
              />
            </div>
          </div>
        </div>
      ))}

      {onAddOfficiel && (
        <AddOfficielDialog
          open={showAddDialog}
          onClose={() => {
            setShowAddDialog(false);
            setPendingIndex(null);
          }}
          onAdd={async (nom, telephone) => {
            const nomTrimmed = nom.trim();
            const telephoneTrimmed = telephone.trim();
            
            // Fermer le dialog d'abord
            setShowAddDialog(false);
            
            // Stocker l'index actuel - CRITIQUE : ne pas le perdre
            const currentPendingIndex = pendingIndex;
            
            if (currentPendingIndex === null || currentPendingIndex >= contacts.length) {
              setPendingIndex(null);
              return;
            }
            
            // Stocker l'officiel en attente AVANT l'ajout pour que l'useEffect puisse l'utiliser
            setPendingOfficiel({ nom: nomTrimmed, telephone: telephoneTrimmed });
            // IMPORTANT : Ne pas réinitialiser pendingIndex ici, il doit rester défini pour l'useEffect
            
            // Mettre à jour IMMÉDIATEMENT le contact avec le nom et le numéro
            // Même si l'officiel n'est pas encore dans la liste officiels, le nom sera dans contact.nom
            // Le dropdown pourra l'afficher une fois que l'officiel sera dans la liste
            const updated = [...contacts];
            if (updated[currentPendingIndex]) {
              updated[currentPendingIndex] = {
                nom: nomTrimmed,
                numero: telephoneTrimmed,
              };
              onContactsChange(updated);
            }
            
            // Ajouter l'officiel et attendre qu'il soit enregistré
            // Cela déclenchera reloadOfficiels() qui mettra à jour la liste officiels
            await onAddOfficiel(nomTrimmed, telephoneTrimmed);
            
            // L'useEffect se chargera de s'assurer que tout est correct quand l'officiel apparaîtra dans officiels
            // Mais le nom est déjà dans le contact, donc le dropdown devrait pouvoir l'afficher
          }}
        />
      )}
    </div>
  );
});
