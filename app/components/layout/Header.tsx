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
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  CalendarOff,
  CalendarRange,
  ChevronLeft,
  Download,
  LogOut,
  Moon,
  MoreVertical,
  RefreshCw,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { useTheme } from "next-themes";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { ExportPdfModal } from "../ui/export-pdf-modal";
import { AddEventDialog } from "../ui/add-event-dialog";
import { apiPost } from "@/lib/utils/api";
import { toast } from "sonner";
import { useAppSettings } from "@/hooks/useAppSettings";
import { mergeClubWithSettings } from "@/lib/settings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { canEdit, isReadOnlyRole } from "@/lib/auth/roles";
import { useUnreadNotificationsCount } from "@/hooks/useUnreadNotificationsCount";
import { cn } from "@/lib/utils";

interface HeaderProps {
  club?: ClubInfo;
  onScrapeComplete: () => void;
  onEventAdded?: () => void;
}

const MOBILE_PAGE_TITLES: Record<string, string> = {
  "/planning/controle": "Contrôle du planning",
  "/planning/charge": "Charge des officiels",
  "/planning/recurrent": "Planning récurrent",
  "/planning": "Planning",
  "/configuration/utilisateurs/nouveau": "Ajouter un utilisateur",
  "/configuration/utilisateurs": "Modifier l'utilisateur",
  "/configuration": "Configuration",
  "/mon-calendrier": "Mon calendrier",
  "/mon-planning": "Mon planning",
  "/mes-indisponibilites": "Mes indisponibilités",
  "/notifications": "Notifications",
  "/profil": "Mon profil",
};

function getMobilePageTitle(pathname: string): string | null {
  const match = Object.entries(MOBILE_PAGE_TITLES).find(([prefix]) => pathname.startsWith(prefix));
  return match ? match[1] : null;
}

export const Header = memo(function Header({ club, onScrapeComplete, onEventAdded }: HeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isPlanningPage = pathname === "/planning";
  const mobilePageTitle = getMobilePageTitle(pathname);
  const { setTheme } = useTheme();
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAddEventDialogOpen, setIsAddEventDialogOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const { settings } = useAppSettings();
  const displayClub = mergeClubWithSettings(club, settings);
  const { user } = useCurrentUser();
  const editable = canEdit(user?.role);
  const personal = isReadOnlyRole(user?.role);

  const homeHref = personal ? "/mon-planning" : "/";
  const isHome = pathname === homeHref;
  const { unread: unreadNotifications } = useUnreadNotificationsCount();

  const handleAddEventSuccess = () => {
    setIsAddEventDialogOpen(false);
    onEventAdded?.();
  };

  const handleScrape = async () => {
    setIsScraping(true);
    try {
      await apiPost("/api/scraper");
      toast.success("Actualisation réussie", {
        description: "Les matchs ont été mis à jour avec succès.",
      });
      setTimeout(() => onScrapeComplete(), 1000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Erreur inconnue";
      toast.error("Erreur lors de l'actualisation", { description: errorMessage });
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
      toast.error("Erreur lors de la déconnexion", { description: errorMessage });
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
                <Link href={homeHref} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity flex-1">
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
            <Link href={homeHref} className="hidden md:flex items-center gap-4 min-w-0 hover:opacity-80 transition-opacity flex-1">
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

            <div className="flex items-center gap-2 sm:gap-4">
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-9 w-9 p-0">
                      <MoreVertical className="h-5 w-5" />
                      <span className="sr-only">Menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {personal && (
                      <DropdownMenuItem onClick={() => router.push("/mes-indisponibilites")}>
                        <CalendarOff className="h-4 w-4 mr-2" /> Mes indisponibilités
                      </DropdownMenuItem>
                    )}
                    {editable && (
                      <>
                        <DropdownMenuItem onClick={() => router.push("/planning/controle")}>
                          <AlertTriangle className="h-4 w-4 mr-2" /> Contrôle du planning
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/planning/charge")}>
                          <BarChart3 className="h-4 w-4 mr-2" /> Charge des officiels
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => router.push("/planning/recurrent")}>
                          <CalendarRange className="h-4 w-4 mr-2" /> Planning récurrent
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setIsExportModalOpen(true)}>
                          <Download className="h-4 w-4 mr-2" /> Export
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem onClick={() => router.push("/notifications")}>
                      <Bell className="h-4 w-4 mr-2" /> Notifications
                      {!!unreadNotifications && (
                        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                          {unreadNotifications > 9 ? '9+' : unreadNotifications}
                        </span>
                      )}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => router.push("/profil")}>
                      <UserRound className="h-4 w-4 mr-2" /> Mon profil
                    </DropdownMenuItem>
                    {editable && (
                      <DropdownMenuItem onClick={handleScrape} disabled={isScraping}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isScraping ? "animate-spin" : ""}`} />
                        {isScraping ? "Actualisation..." : "Actualiser"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => setTheme("light")}>
                      <Sun className="h-4 w-4 mr-2" /> Mode clair
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("dark")}>
                      <Moon className="h-4 w-4 mr-2" /> Mode sombre
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setTheme("system")}>Système</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                      <LogOut className="h-4 w-4 mr-2" /> Déconnexion
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="hidden md:block"><ThemeToggle /></div>

              <div className="hidden md:flex items-center gap-1">
                {personal && pathname !== "/mon-planning" && (
                  <Link href="/mon-planning">
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" /> Mon planning
                    </Button>
                  </Link>
                )}
                {editable && !isPlanningPage && (
                  <Link href="/planning">
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" /> Planning
                    </Button>
                  </Link>
                )}
                {editable && (
                  <Link href="/planning/controle">
                    <Button variant="ghost" size="icon" className="h-9 w-9" title="Contrôle du planning">
                      <AlertTriangle className="h-4 w-4" /><span className="sr-only">Contrôle du planning</span>
                    </Button>
                  </Link>
                )}
                {editable && (
                  <Link href="/planning/charge">
                    <Button variant="ghost" size="icon" className="h-9 w-9" title="Charge des officiels">
                      <BarChart3 className="h-4 w-4" /><span className="sr-only">Charge des officiels</span>
                    </Button>
                  </Link>
                )}
                {editable && (
                  <Link href="/planning/recurrent">
                    <Button variant="ghost" size="icon" className="h-9 w-9" title="Planning récurrent">
                      <CalendarRange className="h-4 w-4" /><span className="sr-only">Planning récurrent</span>
                    </Button>
                  </Link>
                )}
                {editable && <ExportButton />}
                <Link href="/notifications" className="relative">
                  <Button variant="ghost" size="icon" className="h-9 w-9" title="Notifications">
                    <Bell className="h-4 w-4" /><span className="sr-only">Notifications</span>
                    {!!unreadNotifications && (
                      <span
                        className={cn(
                          'absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full',
                          'bg-destructive px-1 text-[9px] font-semibold text-destructive-foreground',
                        )}
                      >
                        {unreadNotifications > 9 ? '9+' : unreadNotifications}
                      </span>
                    )}
                  </Button>
                </Link>
                <Link href="/mon-calendrier">
                  <Button variant="ghost" size="icon" className="h-9 w-9" title="Mon calendrier">
                    <CalendarDays className="h-4 w-4" /><span className="sr-only">Mon calendrier</span>
                  </Button>
                </Link>
                <Link href="/profil">
                  <Button variant="ghost" size="icon" className="h-9 w-9" title="Mon profil">
                    <UserRound className="h-4 w-4" /><span className="sr-only">Mon profil</span>
                  </Button>
                </Link>
                {editable && <ScraperButton onScrapeComplete={onScrapeComplete} />}
                {editable && (
                  <Link href="/configuration">
                    <Button variant="ghost" size="icon" className="h-9 w-9" title="Configuration">
                      <Settings className="h-4 w-4" /><span className="sr-only">Configuration</span>
                    </Button>
                  </Link>
                )}
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={handleLogout} title="Déconnexion">
                  <LogOut className="h-4 w-4" /><span className="sr-only">Déconnexion</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </header>

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
