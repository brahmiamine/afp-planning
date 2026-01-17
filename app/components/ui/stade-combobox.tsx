'use client';

import { useState, useCallback, memo } from 'react';
import { Check, ChevronsUpDown, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Stade } from '@/hooks/useStades';

interface StadeComboboxProps {
  stades: Stade[];
  value?: string;
  onValueChange: (stade: Stade | null) => void;
  placeholder?: string;
  className?: string;
}

export const StadeCombobox = memo(function StadeCombobox({
  stades,
  value,
  onValueChange,
  placeholder = 'Sélectionner un stade...',
  className,
}: StadeComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedStade = stades.find((s) => s.nom === value) || null;

  const handleSelect = useCallback((stadeNom: string) => {
    const stade = stades.find((s) => s.nom === stadeNom) || null;
    onValueChange(stade);
    setOpen(false);
  }, [stades, onValueChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between h-9 sm:h-10 text-sm sm:text-base', className)}
        >
          <span className={cn('truncate', !selectedStade && 'text-muted-foreground')}>
            {selectedStade ? selectedStade.nom : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full max-w-[90vw] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher un stade..." className="text-sm sm:text-base" />
          <CommandList>
            <CommandEmpty>Aucun stade trouvé.</CommandEmpty>
            <CommandGroup>
              {stades.map((stade) => (
                <CommandItem
                  key={stade.nom}
                  value={stade.nom}
                  onSelect={() => handleSelect(stade.nom)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedStade?.nom === stade.nom ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-medium truncate">{stade.nom}</span>
                    {stade.adresse && (
                      <span className="text-xs sm:text-sm text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 flex-shrink-0" />
                        {stade.adresse}
                      </span>
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
