"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PersonnalisationTab } from "@/app/components/configuration/PersonnalisationTab";
import { CategoriesTab } from "@/app/components/configuration/CategoriesTab";
import { StadesTab } from "@/app/components/configuration/StadesTab";
import { PlanningFeaturesTab } from "@/app/components/configuration/PlanningFeaturesTab";
import { useCurrentUser } from "@/app/hooks/useCurrentUser";
import { canEdit } from "@/lib/auth/roles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import { Tag, MapPin, Palette, Settings2 } from "lucide-react";
import { LoadingSpinner } from "@/app/components/ui/loading-spinner";

export default function ConfigurationPage() {
  const router = useRouter();
  const { user: currentUser, isLoading: isLoadingCurrentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'personnalisation';
    return new URLSearchParams(window.location.search).get('tab') || 'personnalisation';
  });
  useEffect(() => {
    if (!isLoadingCurrentUser && currentUser && !canEdit(currentUser.roles)) {
      router.replace('/mon-planning');
    }
  }, [isLoadingCurrentUser, currentUser, router]);

  return (
    <div>
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Configuration</h1>
          <p className="text-muted-foreground text-sm sm:text-base">Gérez la personnalisation, les catégories et les stades</p>
        </div>

        {isLoadingCurrentUser ? (
          <LoadingSpinner size={48} text="Chargement..." className="py-20" />
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className={`grid w-full grid-cols-2 mb-6 ${canEdit(currentUser?.roles) ? 'sm:grid-cols-4' : 'sm:grid-cols-2'}`}>
              <TabsTrigger value="personnalisation" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                <span className="hidden sm:inline">Personnalisation</span>
              </TabsTrigger>
              {canEdit(currentUser?.roles) && (
                <TabsTrigger value="fonctionnalites" className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Fonctionnalités</span>
                </TabsTrigger>
              )}
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span className="hidden sm:inline">Catégories</span>
              </TabsTrigger>
              <TabsTrigger value="stades" className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Stades</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="personnalisation">
              <PersonnalisationTab />
            </TabsContent>

            {canEdit(currentUser?.roles) && (
              <TabsContent value="fonctionnalites">
                <PlanningFeaturesTab />
              </TabsContent>
            )}

            <TabsContent value="categories">
              <CategoriesTab />
            </TabsContent>

            <TabsContent value="stades">
              <StadesTab />
            </TabsContent>
          </Tabs>
        )}
    </div>
  );
}
