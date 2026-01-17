'use client';

import Image from 'next/image';
import { memo } from 'react';
import { ClubInfo } from '@/types/match';
import { ScraperButton } from '../matches/ScraperButton';
import { ThemeToggle } from '../ui/theme-toggle';

interface HeaderProps {
  club?: ClubInfo;
  onScrapeComplete: () => void;
}

export const Header = memo(function Header({ club, onScrapeComplete }: HeaderProps) {
  return (
    <header className="bg-card shadow-lg border-b border-border">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4">
            {club?.logo && (
              <Image
                src={club.logo}
                alt={club.name}
                width={64}
                height={64}
                className="w-16 h-16 rounded-full object-cover border-2 border-border"
                unoptimized
              />
            )}
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {club?.name || 'Academie Football Paris 18'}
              </h1>
              <p className="text-muted-foreground mt-1">
                {club?.description || 'Club de Football à Paris 18'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <ScraperButton onScrapeComplete={onScrapeComplete} />
          </div>
        </div>
      </div>
    </header>
  );
});
