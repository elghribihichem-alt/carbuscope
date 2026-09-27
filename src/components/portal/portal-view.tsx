'use client'

// Module C — Portail Enseigne : espace sécurisé d'auto-publication (agent 5-e)

import { useEffect, useState } from "react"
import { useAppStore } from "@/store/app-store"
import { Tabs, TabsContent } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, Building2 } from "lucide-react"
import type { BrandDTO } from "@/lib/types"
import { num } from "@/components/settings/settings-shared"
import { PortalDashboard } from "./portal-dashboard"
import { PortalStations } from "./portal-stations"
import { PortalPromotions } from "./portal-promotions"
import { PortalApi } from "./portal-api"
import { PortalReviews } from "./portal-reviews"
import { PortalTerrain } from "./portal-terrain"
import { NotificationsCenter } from "./notifications-center"

export function PortalView() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const [brand, setBrand] = useState<BrandDTO | null>(null)
  // Onglet contrôlé par la sidebar (store T46, clé « portail ») : le deep-link
  // depuis le centre de notifications (alerte de veille → « Avis & réputation »,
  // décret prix → tableau de bord) écrit dans le même store.
  const setNav = useAppStore(s => s.setNav)
  const tab = useAppStore(s => s.nav.portail) ?? "dashboard"
  const setTab = (v: string) => setNav("portail", v)

  useEffect(() => {
    const ac = new AbortController()
    fetch("/api/brands", { signal: ac.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: { brands: BrandDTO[] }) => {
        setBrand(j.brands.find(b => b.slug === brandSlug) ?? null)
      })
      .catch(() => {})
    return () => ac.abort()
  }, [brandSlug])

  const brandName = brand?.name ?? (brandSlug.charAt(0).toUpperCase() + brandSlug.slice(1))
  const stationCount = brand?.stationCount ?? null

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Bandeau d'accueil de l'espace enseigne */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
              <ShieldCheck className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight">Portail Enseigne — {brandName}</h1>
                <Badge
                  variant="outline"
                  className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                >
                  Espace sécurisé
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Auto-publication de vos données : gérez vos stations, vos services, vos promotions et synchronisez
                votre référentiel via API — sans attendre la plateforme.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                style={{ backgroundColor: brand?.color ?? "#059669" }}
                aria-hidden
              />
              <div className="text-sm">
                <p className="font-semibold leading-none">{stationCount !== null ? `${num(stationCount)} stations` : "Réseau national"}</p>
                <p className="mt-1 text-xs text-muted-foreground">Référentiel de l&apos;enseigne</p>
              </div>
              <Building2 className="ml-2 h-4 w-4 text-muted-foreground" aria-hidden />
            </div>
            {/* Cloche de notifications : veille des notes + décrets prix + vie de la plateforme */}
            <NotificationsCenter
              key={brandSlug}
              brandSlug={brandSlug}
              onNavigate={kind => setTab(kind === "reviews" ? "reviews" : "dashboard")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contenu de l'onglet actif — la navigation (5 onglets) est portée par la sidebar */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsContent value="dashboard" className="mt-0 space-y-4">
          <PortalDashboard brandSlug={brandSlug} />
        </TabsContent>
        <TabsContent value="reviews" className="mt-0 space-y-4">
          <PortalReviews key={brandSlug} brandSlug={brandSlug} />
        </TabsContent>
        <TabsContent value="stations" className="mt-0 space-y-4">
          <PortalStations brandSlug={brandSlug} />
        </TabsContent>
        <TabsContent value="terrain" className="mt-0 space-y-4">
          <PortalTerrain brandSlug={brandSlug} key={brandSlug} />
        </TabsContent>
        <TabsContent value="api" className="mt-0 space-y-4">
          <PortalPromotions brandName={brandName} />
          <PortalApi brandName={brandName} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
