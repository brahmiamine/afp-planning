'use client';

import { useState, useMemo, memo } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface Officiel {
  nom: string;
  telephone?: string;
}

interface OfficielComboboxProps {
  officiels: Officiel[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const OfficielCombobox = memo(function OfficielCombobox({
  officiels,
  value,
  onValueChange,
  placeholder = 'Sélectionner un officiel...',
  className = '',
}: OfficielComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedOfficiel = useMemo(() => {
    return officiels.find((o) => o.nom === value);
  }, [officiels, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between', className)}
        >
          {selectedOfficiel ? (
            <span className="truncate">{selectedOfficiel.nom}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher un officiel..." />
          <CommandList>
            <CommandEmpty>Aucun officiel trouvé.</CommandEmpty>
            <CommandGroup>
              {officiels.map((officiel) => (
                <CommandItem
                  key={officiel.nom}
                  value={officiel.nom}
                  onSelect={() => {
                    onValueChange(officiel.nom === value ? '' : officiel.nom);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === officiel.nom ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{officiel.nom}</div>
                    {officiel.telephone && (
                      <div className="text-xs text-muted-foreground">
                        {officiel.telephone}
                      </div>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
