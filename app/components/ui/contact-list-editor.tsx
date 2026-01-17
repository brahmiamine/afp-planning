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
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addContact}
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </Button>
      </div>

      {contacts.length === 0 && (
        <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
          Aucun contact ajouté. Cliquez sur "Ajouter" pour en ajouter un.
        </div>
      )}

      {contacts.map((contact, index) => (
        <div
          key={index}
          className="p-4 border border-border rounded-lg space-y-3 bg-card"
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
              className="h-6 w-6"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Nom</Label>
              <div className="flex gap-2">
                <OfficielCombobox
                  officiels={officiels}
                  value={contact.nom}
                  onValueChange={(value) => handleOfficielSelect(index, value)}
                  placeholder={placeholder}
                  className="flex-1"
                />
                {onAddOfficiel && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setPendingIndex(index);
                      setShowAddDialog(true);
                    }}
                    className="h-10 w-10"
                    title="Ajouter un officiel manuellement"
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Numéro de téléphone</Label>
              <Input
                type="tel"
                value={contact.numero}
                onChange={(e) => updateContact(index, 'numero', e.target.value)}
                placeholder="Numéro de téléphone"
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
