'use client';

import { X, Plus, UserPlus } from 'lucide-react';
import { memo, useState } from 'react';
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
    const selected = officiels.find((o) => o.nom === value);
    const updated = [...contacts];
    updated[index] = {
      nom: value,
      numero: selected?.telephone || updated[index]?.numero || '',
    };
    onContactsChange(updated);
  };

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
            await onAddOfficiel(nom, telephone);
            if (pendingIndex !== null) {
              updateContact(pendingIndex, 'nom', nom);
              updateContact(pendingIndex, 'numero', telephone);
            }
            setShowAddDialog(false);
            setPendingIndex(null);
          }}
        />
      )}
    </div>
  );
});
