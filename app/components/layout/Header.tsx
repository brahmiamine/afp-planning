'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { memo, useState } from 'react';
import { ClubInfo } from '@/types/match';
import { ScraperButton } from '../matches/ScraperButton';
import { ThemeToggle } from '../ui/theme-toggle';
import { ExportButton } from '../ui/export-button';
import { Button } from '../ui/button';
import { Calendar, MoreVertical, Download, RefreshCw, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { ExportPdfModal } from '../ui/export-pdf-modal';
import { AddEventDialog } from '../ui/add-event-dialog';
import { apiPost } from '@/lib/utils/api';
import { toast } from 'sonner';

interface HeaderProps {
  club?: ClubInfo;
  onScrapeComplete: () => void;
  onEventAdded?: () => void;
}

export const Header = memo(function Header({ club, onScrapeComplete, onEventAdded }: HeaderProps) {
  const pathname = usePathname();
  const isPlanningPage = pathname === '/planning';
  const { setTheme } = useTheme();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);

  const handleAddEventSuccess = () => {
    setIsAddEventDialogOpen(false);
    if (onEventAdded) {
      onEventAdded();
    }
  };

  const handleScrape = async () => {
    setIsScraping(true);
    try {
      await apiPost('/api/scraper');
      toast.success('Actualisation réussie', {
        description: 'Les matchs ont été mis à jour avec succès.',
      });
      setTimeout(() => {
        onScrapeComplete();
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';
      toast.error('Erreur lors de l\'actualisation', {
        description: errorMessage,
      });
    } finally {
      setIsScraping(false);
    }
  };

  return (
    <>
      <header className="bg-card shadow-lg border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Logo et titre - à gauche */}
            <Link href="/" className="flex items-center gap-3 sm:gap-4 min-w-0 hover:opacity-80 transition-opacity flex-1">
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

            {/* Actions - Desktop: tous les boutons, Mobile: menu */}
            <div className="flex items-center gap-2 sm:gap-4">
              {/* Menu hamburger avec trois points - visible uniquement sur mobile */}
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                      <MoreVertical className="h-5 w-5" />
                      <span className="sr-only">Menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuItem onClick={() => setIsExportModalOpen(true)}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleScrape} disabled={isScraping}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? 'animate-spin' : ''}`} />
                      {isScraping ? 'Actualisation...' : 'Actualiser'}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('light')}>
                      <Sun className="h-4 w-4 mr-2" />
                      Mode clair
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('dark')}>
                      <Moon className="h-4 w-4 mr-2" />
                      Mode sombre
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme('system')}>
                      <span>Système</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Desktop: thème toujours visible */}
              <div className="hidden md:block">
                <ThemeToggle />
              </div>

              {/* Desktop: tous les boutons */}
              <div className="hidden md:flex items-center gap-2">
                {!isPlanningPage && (
                  <Link href="/planning">
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>Planning</span>
                    </Button>
                  </Link>
                )}
                <ExportButton />
                <ScraperButton onScrapeComplete={onScrapeComplete} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Modals pour mobile */}
      <ExportPdfModal open={isExportModalOpen} onOpenChange={setIsExportModalOpen} />
      <AddEventDialog
        open={isAddEventDialogOpen}
        onClose={() => setIsAddEventDialogOpen(false)}
        eventType="amical"
        onSuccess={handleAddEventSuccess}
      />
    </>
  );
});
