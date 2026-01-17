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
    if (!value) return undefined;
    return officiels.find((o) => o.nom === value || o.nom.trim() === value.trim());
  }, [officiels, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between min-w-0 text-left h-9 sm:h-10', className)}
        >
          <span className={cn(
            'flex-1 min-w-0 truncate text-sm sm:text-base',
            selectedOfficiel ? 'text-foreground font-medium' : 'text-muted-foreground'
          )}>
            {selectedOfficiel ? selectedOfficiel.nom : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50 flex-shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-[var(--radix-popover-trigger-width)] max-w-[90vw] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl p-0" 
        align="start"
        sideOffset={4}
      >
        <Command>
          <CommandInput placeholder="Rechercher un officiel..." className="h-10" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Aucun officiel trouvé.</CommandEmpty>
            <CommandGroup>
              {officiels.map((officiel) => {
                const isSelected = value && (officiel.nom === value || officiel.nom.trim() === value.trim());
                return (
                  <CommandItem
                    key={officiel.nom}
                    value={officiel.nom}
                    onSelect={() => {
                      onValueChange(isSelected ? '' : officiel.nom);
                      setOpen(false);
                    }}
                    className="cursor-pointer"
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4 shrink-0',
                        isSelected ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{officiel.nom}</div>
                      {officiel.telephone && (
                        <div className="text-xs text-muted-foreground truncate">
                          {officiel.telephone}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
});
