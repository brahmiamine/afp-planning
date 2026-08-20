"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Header } from "../components/layout/Header";
import { UsersManagementTab } from "../components/configuration/UsersManagementTab";
import { PersonnalisationTab } from "../components/configuration/PersonnalisationTab";
import { OfficielsTab } from "../components/configuration/OfficielsTab";
import { EncadrantsTab } from "../components/configuration/EncadrantsTab";
import { AccompagnateursTab } from "../components/configuration/AccompagnateursTab";
import { CategoriesTab } from "../components/configuration/CategoriesTab";
import { ClubsTab } from "../components/configuration/ClubsTab";
import { StadesTab } from "../components/configuration/StadesTab";
import { PlanningFeaturesTab } from "../components/configuration/PlanningFeaturesTab";
import { useCurrentUser } from "../hooks/useCurrentUser";
import { canEdit, isSuperadmin } from "../lib/auth/roles";
import { useMatches } from "../hooks/useMatches";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Users, Tag, Building2, MapPin, Palette, Settings2 } from "lucide-react";
import { LoadingSpinner } from "../components/ui/loading-spinner";

export default function ConfigurationPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'personnalisation';
    return new URLSearchParams(window.location.search).get('tab') || 'personnalisation';
  });
  const { matchesData } = useMatches();

  useEffect(() => {
    if (!isLoadingCurrentUser && currentUser && !canEdit(currentUser.roles)) {
      router.replace('/');
    }
  }, [isLoadingCurrentUser, currentUser, router]);

  return (
    <div className="min-h-screen bg-background">
      <Header club={matchesData?.club} onScrapeComplete={() => {}} />

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Configuration</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gérez la personnalisation, les officiels, catégories, clubs et stades</p>
        </div>

        {isLoadingCurrentUser ? (
          <LoadingSpinner size={48} text="Chargement..." className="py-20" />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full grid-cols-2 mb-6 ${isSuperadmin(currentUser?.roles) ? 'sm:grid-cols-9' : 'sm:grid-cols-7'}`}>
              <TabsTrigger value="personnalisation" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Personnalisation</span>
              </TabsTrigger>
              {isSuperadmin(currentUser?.roles) && (
                <TabsTrigger value="fonctionnalites" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Fonctionnalités</span>
                </TabsTrigger>
              )}
              {isSuperadmin(currentUser?.roles) && (
                <TabsTrigger value="utilisateurs" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Utilisateurs</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="officiels" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Officiels</span>
              </TabsTrigger>
              <TabsTrigger value="encadrants" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Encadrants</span>
              </TabsTrigger>
              <TabsTrigger value="accompagnateurs" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Accompagnateurs</span>
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Catégories</span>
              </TabsTrigger>
              <TabsTrigger value="clubs" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                <span className="hidden sm:inline">Clubs</span>
              </TabsTrigger>
              <TabsTrigger value="stades" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Stades</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personnalisation">
              <PersonnalisationTab />
            </TabsContent>

            {isSuperadmin(currentUser?.roles) && (
              <TabsContent value="fonctionnalites">
                <PlanningFeaturesTab />
              </TabsContent>
            )}

            {isSuperadmin(currentUser?.roles) && (
              <TabsContent value="utilisateurs">
                <UsersManagementTab />
              </TabsContent>
            )}

            <TabsContent value="officiels">
              <OfficielsTab />
            </TabsContent>

            <TabsContent value="encadrants">
              <EncadrantsTab />
            </TabsContent>

            <TabsContent value="accompagnateurs">
              <AccompagnateursTab />
            </TabsContent>

            <TabsContent value="categories">
              <CategoriesTab />
            </TabsContent>

            <TabsContent value="clubs">
              <ClubsTab />
            </TabsContent>

            <TabsContent value="stades">
              <StadesTab />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
