"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { memo, useState } from "react";
import { ClubInfo } from "@/types/match";
import { ScraperButton } from "../matches/ScraperButton";
import { ThemeToggle } from "../ui/theme-toggle";
import { ExportButton } from "../ui/export-button";
import { Button } from "../ui/button";
import { Calendar, MoreVertical, Download, RefreshCw, Sun, Moon, Settings, LogOut, CalendarDays, ChevronLeft } from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ExportPdfModal } from "../ui/export-pdf-modal";
import { AddEventDialog } from "../ui/add-event-dialog";
import { apiPost } from "@/lib/utils/api";
import { toast } from "sonner";
import { useAppSettings } from "@/hooks/useAppSettings";
import { mergeClubWithSettings } from "@/lib/settings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";

interface HeaderProps {
  club?: ClubInfo;
  onScrapeComplete: () => void;
  onEventAdded?: () => void;
}

const MOBILE_PAGE_TITLES: Record<string, string> = {
  "/planning": "Planning",
  "/configuration": "Configuration",
  "/mon-calendrier": "Mon calendrier",
};

function getMobilePageTitle(pathname: string): string | null {
  const match = Object.entries(MOBILE_PAGE_TITLES).find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : null;
}

export const Header = memo(function Header({ club, onScrapeComplete, onEventAdded }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isPlanningPage = pathname === "/planning";
  const isHome = pathname === "/";
  const mobilePageTitle = getMobilePageTitle(pathname);
  const { setTheme } = useTheme();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const { settings } = useAppSettings();
  const displayClub = mergeClubWithSettings(club, settings);
  const { user } = useCurrentUser();
  const editable = canEdit(user?.role);

  const handleAddEventSuccess = () => {
    setIsAddEventDialogOpen(false);
    if (onEventAdded) {
      onEventAdded();
    }
  };

  const handleScrape = async () => {
    setIsScraping(true);
    try {
      await apiPost("/api/scraper");
      toast.success("Actualisation réussie", {
        description: "Les matchs ont été mis à jour avec succès.",
      });
      setTimeout(() => {
        onScrapeComplete();
      }, 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur lors de l'actualisation", {
        description: errorMessage,
      });
    } finally {
      setIsScraping(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiPost("/api/auth/logout");
      toast.success("Déconnexion réussie");
      router.push("/login");
      router.refresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur lors de la déconnexion", {
        description: errorMessage,
      });
    }
  };

  return (
    <>
      <header className="bg-card shadow-lg border-b border-border">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex flex-row items-center justify-between gap-3 sm:gap-4">
            {/* Mobile: bouton retour + titre de page sur les sous-pages, logo sur l'accueil */}
            <div className="flex items-center min-w-0 flex-1 md:hidden">
              {!isHome ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 -ml-2 shrink-0"
                    onClick={() => router.back()}
                  >
                    <ChevronLeft className="h-5 w-5" />
                    <span className="sr-only">Retour</span>
                  </Button>
                  <h1 className="text-lg font-bold text-foreground truncate">
                    {mobilePageTitle ?? displayClub.name}
                  </h1>
                </>
              ) : (
                <Link href="/" className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity flex-1">
                  {displayClub.logo && (
                    <Image
                      src={displayClub.logo}
                      alt={displayClub.name}
                      width={64}
                      height={64}
                      className="w-12 h-12 rounded-full object-cover border-2 border-border shrink-0"
                      unoptimized
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold text-foreground truncate">{displayClub.name}</h1>
                    <p className="text-muted-foreground mt-0.5 text-xs truncate">{displayClub.description}</p>
                  </div>
                </Link>
              )}
            </div>

            {/* Desktop/tablette: logo et titre toujours visibles - à gauche */}
            <Link href="/" className="hidden md:flex items-center gap-4 min-w-0 hover:opacity-80 transition-opacity flex-1">
              {displayClub.logo && (
                <Image
                  src={displayClub.logo}
                  alt={displayClub.name}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border-2 border-border shrink-0"
                  unoptimized
                />
              )}
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">{displayClub.name}</h1>
                <p className="text-muted-foreground mt-1 text-sm truncate">{displayClub.description}</p>
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
                    {editable && (
                      <DropdownMenuItem onClick={handleScrape} disabled={isScraping}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                        {isScraping ? "Actualisation..." : "Actualiser"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setTheme("light")}>
                      <Sun className="h-4 w-4 mr-2" />
                      Mode clair
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                      <Moon className="h-4 w-4 mr-2" />
                      Mode sombre
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>
                      <span>Système</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4 mr-2" />
                      Déconnexion
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
                <Link href="/mon-calendrier">
                  <Button variant="ghost" size="icon" className="h-9 w-9">
                    <CalendarDays className="h-4 w-4" />
                    <span className="sr-only">Mon calendrier</span>
                  </Button>
                </Link>
                {editable && <ScraperButton onScrapeComplete={onScrapeComplete} />}
                {editable && (
                  <Link href="/configuration">
                    <Button variant="ghost" size="icon" className="h-9 w-9">
                      <Settings className="h-4 w-4" />
                      <span className="sr-only">Configuration</span>
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleLogout} title="Déconnexion">
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Déconnexion</span>
                </Button>
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
