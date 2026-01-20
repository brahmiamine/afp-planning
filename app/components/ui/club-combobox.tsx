'use client';

import { useState, useCallback, memo } from 'react';
import Image from 'next/image';
import { Check, ChevronsUpDown } from 'lucide-react';
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
import { Club } from '@/hooks/useClubs';

interface ClubComboboxProps {
  clubs: Club[];
  value?: string;
  onValueChange: (club: Club | null) => void;
  placeholder?: string;
  className?: string;
}

export const ClubCombobox = memo(function ClubCombobox({
  clubs,
  value,
  onValueChange,
  placeholder = 'Sélectionner un club...',
  className,
}: ClubComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedClub = clubs.find((c) => c.nom === value) || null;

  const handleSelect = useCallback((clubNom: string) => {
    const club = clubs.find((c) => c.nom === clubNom) || null;
    onValueChange(club);
    setOpen(false);
  }, [clubs, onValueChange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between h-9 sm:h-10 text-sm sm:text-base', className)}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectedClub?.logo && (
              <Image
                src={selectedClub.logo}
                alt={selectedClub.nom}
                width={20}
                height={20}
                className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                unoptimized
              />
            )}
            <span className={cn('truncate', !selectedClub && 'text-muted-foreground')}>
              {selectedClub ? selectedClub.nom : placeholder}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full max-w-[90vw] sm:max-w-md md:max-w-lg lg:max-w-xl xl:max-w-2xl p-0" align="start">
        <Command>
          <CommandInput placeholder="Rechercher un club..." className="text-sm sm:text-base" />
          <CommandList className="max-h-[300px]">
            <CommandEmpty>Aucun club trouvé.</CommandEmpty>
            <CommandGroup>
              {clubs.map((club, index) => (
                <CommandItem
                  key={`${club.nom}-${club.logo}-${index}`}
                  value={club.nom}
                  onSelect={() => handleSelect(club.nom)}
                  className="cursor-pointer"
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4 shrink-0',
                      selectedClub?.nom === club.nom ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {club.logo && (
                      <Image
                        src={club.logo}
                        alt={club.nom}
                        width={24}
                        height={24}
                        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
                        unoptimized
                      />
                    )}
                    <span className="font-medium truncate">{club.nom}</span>
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
