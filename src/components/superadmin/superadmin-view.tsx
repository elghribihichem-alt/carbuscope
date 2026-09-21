'use client'

// Super Administration (T33) — espace racine de pilotage SaaS de CarbuScope :
// contrats des enseignes clientes, facturation, comptes utilisateurs, audit.
// Accès réservé au compte super-administrateur (flag isSuperAdmin du compte démo).

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Crown, LayoutDashboard, FileSignature, Layers, Receipt, UsersRound, BarChart3, Bot, MapPinned, ScrollText, ShieldAlert } from "lucide-react"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { SaOverview } from "./sa-overview"
import { SaContracts } from "./sa-contracts"
import { SaPlans } from "./sa-plans"
import { SaInvoices } from "./sa-invoices"
import { SaUsers } from "./sa-users"
import { SaDemographie } from "./sa-demographie"
import { SaAiAgent } from "./sa-ai-agent"
import { SaCarto } from "./sa-carto"
import { SaAudit } from "./sa-audit"

export function SuperAdminView() {
  const userId = useAppStore(s => s.userId)
  const account = userId ? DEMO_ACCOUNTS_MAP[userId] : null
  const [tab, setTab] = useState("overview")

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* Bandeau racine */}
      <Card>
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-400">
              <Crown className="h-5.5 w-5.5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-bold leading-tight">Super Administration — CarbuScope</h1>
                <Badge
                  variant="outline"
                  className="border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-400"
                >
                  Accès racine
                </Badge>
              </div>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Pilotage SaaS de la plateforme : contrats et abonnements des enseignes, facturation,
                comptes utilisateurs et journal d&apos;audit des actions sensibles.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <ShieldAlert className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
              <div className="text-sm">
                <p className="font-semibold leading-none">{account?.name ?? "Super-admin"}</p>
                <p className="mt-1 text-xs text-muted-foreground">{account?.email ?? "—"}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navigation interne (9 onglets — Démographie ajoutée en T35 après
          Utilisateurs, demande utilisateur Phase 4) */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 lg:w-auto">
          <TabsTrigger value="overview" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <LayoutDashboard className="h-4 w-4" aria-hidden /> Vue d&apos;ensemble
          </TabsTrigger>
          <TabsTrigger value="contracts" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <FileSignature className="h-4 w-4" aria-hidden /> Enseignes &amp; contrats
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Layers className="h-4 w-4" aria-hidden /> Plans &amp; tarifs
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Receipt className="h-4 w-4" aria-hidden /> Facturation
          </TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <UsersRound className="h-4 w-4" aria-hidden /> Utilisateurs
          </TabsTrigger>
          <TabsTrigger value="demo" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" aria-hidden /> Démographie
          </TabsTrigger>
          <TabsTrigger value="ai" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <Bot className="h-4 w-4" aria-hidden /> Agent IA
          </TabsTrigger>
          <TabsTrigger value="carto" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <MapPinned className="h-4 w-4" aria-hidden /> Cartographie
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5 px-3 py-2 text-xs sm:text-sm">
            <ScrollText className="h-4 w-4" aria-hidden /> Journal d&apos;audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0 space-y-4">
          <SaOverview onNavigate={setTab} />
        </TabsContent>
        <TabsContent value="contracts" className="mt-0 space-y-4">
          <SaContracts />
        </TabsContent>
        <TabsContent value="plans" className="mt-0 space-y-4">
          <SaPlans />
        </TabsContent>
        <TabsContent value="invoices" className="mt-0 space-y-4">
          <SaInvoices />
        </TabsContent>
        <TabsContent value="users" className="mt-0 space-y-4">
          <SaUsers />
        </TabsContent>
        <TabsContent value="demo" className="mt-0 space-y-4">
          <SaDemographie />
        </TabsContent>
        <TabsContent value="ai" className="mt-0 space-y-4">
          <SaAiAgent />
        </TabsContent>
        <TabsContent value="carto" className="mt-0 space-y-4">
          <SaCarto />
        </TabsContent>
        <TabsContent value="audit" className="mt-0 space-y-4">
          <SaAudit />
        </TabsContent>
      </Tabs>
    </div>
  )
}
