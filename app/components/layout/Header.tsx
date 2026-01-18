'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo } from 'react';
import { ClubInfo } from '@/types/match';
import { ScraperButton } from '../matches/ScraperButton';
import { ThemeToggle } from '../ui/theme-toggle';
import { AddEventButton } from '../ui/add-event-button';
import { ExportButton } from '../ui/export-button';
import { Button } from '../ui/button';
import { Calendar } from 'lucide-react';

interface HeaderProps {
  club?: ClubInfo;
  onScrapeComplete: () => void;
  onEventAdded?: () => void;
}

export const Header = memo(function Header({ club, onScrapeComplete, onEventAdded }: HeaderProps) {
  const pathname = usePathname();
  const isPlanningPage = pathname === '/planning';

  return (
    <header className="bg-card shadow-lg border-b border-border">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 sm:gap-4">
          <Link href="/" className="flex items-center gap-3 sm:gap-4 min-w-0 hover:opacity-80 transition-opacity">
            {club?.logo && (
              <Image
                src={club.logo}
                alt={club.name}
                width={64}
                height={64}
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-border shrink-0"
                unoptimized
              />
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground truncate">
                {club?.name || 'Academie Football Paris 18'}
              </h1>
              <p className="text-muted-foreground mt-0.5 sm:mt-1 text-xs sm:text-sm truncate">
                {club?.description || 'Club de Football à Paris 18'}
              </p>
            </div>
          </Link>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
            <div className="flex items-center justify-end sm:justify-start gap-2">
              <ThemeToggle />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              {!isPlanningPage && (
                <Link href="/planning">
                  <Button variant="outline" size="sm" className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Planning</span>
                  </Button>
                </Link>
              )}
              <ExportButton />
              <AddEventButton onEventAdded={onEventAdded || (() => {})} />
              <ScraperButton onScrapeComplete={onScrapeComplete} />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
});
