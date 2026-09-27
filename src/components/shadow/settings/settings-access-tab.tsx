'use client'

// Shadow Market (T44-e) — Paramètres · onglet « 🔐 Accès & Droits ».
// Matrice documentée des rôles (qui voit quoi), comptes réels de la plateforme
// (GET /api/auth/accounts) avec accès Shadow déduit du rôle/enseigne, statut
// 2FA et interrupteur simulé (contrôle de lecture — gestion Super Admin).

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Eye, Lock, ShieldCheck, UserRound } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type AccountRow = {
  name: string
  email: string
  role: string
  brandSlug: string | null
  brandName: string | null
  totpEnabled: boolean
}

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Administration",
  ADMIN: "Administrateur",
  NETWORK: "Direction Réseau",
  COMMERCIAL: "Direction Commerciale",
  EXPANSION: "Direction Expansion",
  VIEWER: "Observateur",
}

// Matrice documentée — périmètres et droits par rôle (cahier des charges T44).
const ROLE_MATRIX: {
  role: string
  scope: string
  scopeTone: "red" | "orange" | "yellow" | "green" | "neutral"
  vision: string
  rights: { label: string; write: boolean }[]
}[] = [
  {
    role: "Super Administration",
    scope: "National — toutes enseignes",
    scopeTone: "red",
    vision: "Vision nationale complète (points, stations, pertes, zones rouges) + paramétrage du module Shadow.",
    rights: [
      { label: "Lecture nationale", write: false },
      { label: "Écriture — paramétrage & validation", write: true },
    ],
  },
  {
    role: "DG enseigne",
    scope: "National agrégé + ses pertes détaillées",
    scopeTone: "orange",
    vision: "Chiffres nationaux agrégés (repères) et détail de SES stations menacées, pertes et rapports dédiés.",
    rights: [
      { label: "Lecture — enseigne + agrégats", write: false },
      { label: "Génération de rapports", write: true },
    ],
  },
  {
    role: "Directeur Régional",
    scope: "Sa zone uniquement (délégations)",
    scopeTone: "yellow",
    vision: "Vision de sa zone : points informels et stations menacés des délégations relevant de sa direction.",
    rights: [{ label: "Lecture — zone", write: false }],
  },
  {
    role: "Auditeur terrain (contrôleur)",
    scope: "Recensement mobile uniquement",
    scopeTone: "green",
    vision: "Application mobile des contrôleurs : recensement parallèle (photo, GPS, volume) — aucune donnée concurrentielle.",
    rights: [{ label: "Écriture — signalements", write: true }],
  },
]

const SCOPE_TONE_CLASSES: Record<string, string> = {
  red: "border-[#E53935]/40 bg-[#E53935]/10 text-[#C62828] dark:text-[#ef9a9a]",
  orange: "border-[#FF9800]/40 bg-[#FF9800]/10 text-[#E65100] dark:text-[#ffcc80]",
  yellow: "border-[#FFC107]/40 bg-[#FFC107]/15 text-[#B26A00] dark:text-[#ffe082]",
  green: "border-[#4CAF50]/40 bg-[#4CAF50]/10 text-[#2E7D32] dark:text-[#a5d6a7]",
  neutral: "border-stone-300 bg-stone-100 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300",
}

/** Périmètre Shadow déduit du compte (règle : plateforme + enseignes = accès). */
function shadowScopeFor(a: AccountRow): string {
  if (a.role === "SUPER_ADMIN") return "National — Super Administration"
  if (a.brandSlug) return `Enseigne — ${a.brandName ?? a.brandSlug}`
  if (a.role === "NETWORK") return "Zones régionales"
  return "National · lecture"
}

export function SettingsAccessTab() {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/auth/accounts")
      .then(r => {
        if (!r.ok) throw new Error("comptes")
        return r.json() as Promise<{ comptes: AccountRow[] }>
      })
      .then(j => {
        if (alive) setAccounts(j.comptes ?? [])
      })
      .catch(() => {
        if (alive) setError("Les comptes de la plateforme n'ont pas pu être chargés.")
      })
    return () => {
      alive = false
    }
  }, [])

  return (
    <div className="space-y-4">
      {/* Matrice des rôles */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <span aria-hidden>🧭</span> Matrice des rôles — qui voit quoi
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Le périmètre est appliqué côté serveur (session signée) — cette matrice documente le comportement du module.
          </p>
          <div className="overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-800">
            <Table>
              <TableHeader className="bg-stone-50 dark:bg-stone-900">
                <TableRow>
                  <TableHead>Rôle</TableHead>
                  <TableHead>Périmètre Shadow</TableHead>
                  <TableHead>Vision</TableHead>
                  <TableHead>Droits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROLE_MATRIX.map(r => (
                  <TableRow key={r.role}>
                    <TableCell className="whitespace-nowrap text-xs font-bold text-stone-800 dark:text-stone-100">{r.role}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`max-w-[220px] whitespace-normal text-[10.5px] leading-snug ${SCOPE_TONE_CLASSES[r.scopeTone]}`}>
                        {r.scope}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[380px] text-[11.5px] leading-snug text-muted-foreground">{r.vision}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {r.rights.map(x => (
                          <Badge
                            key={x.label}
                            variant="outline"
                            className={`w-fit gap-1 text-[10.5px] ${
                              x.write
                                ? "border-[#FF9800]/50 bg-[#FF9800]/10 text-[#E65100] dark:text-[#ffcc80]"
                                : "border-[#4CAF50]/40 bg-[#4CAF50]/10 text-[#2E7D32] dark:text-[#a5d6a7]"
                            }`}
                          >
                            {x.write ? <Lock className="h-3 w-3" aria-hidden /> : <Eye className="h-3 w-3" aria-hidden />}
                            {x.label}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Comptes réels */}
      <Card className="border-stone-200 bg-white/95 dark:border-stone-800 dark:bg-stone-900/95">
        <CardContent className="p-4 sm:p-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <UserRound className="h-4 w-4 text-[#FF9800]" aria-hidden />
            Comptes de la plateforme — accès Shadow
          </h3>
          <p className="mb-3 text-xs text-muted-foreground">
            Règle : les comptes enseigne et le personnel plateforme disposent de l&apos;accès Shadow — le périmètre est
            déduit du rôle et de l&apos;enseigne de rattachement.
          </p>

          {error && <p className="rounded-lg border border-dashed border-[#E53935]/50 p-3 text-xs text-[#C62828]">{error}</p>}
          {!error && !accounts && (
            <div className="space-y-2">
              {[0, 1, 2].map(i => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />
              ))}
            </div>
          )}
          {accounts && (
            <div className="max-h-96 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-800 [scrollbar-width:thin]">
              <Table>
                <TableHeader className="sticky top-0 bg-stone-50 dark:bg-stone-900">
                  <TableRow>
                    <TableHead>Compte</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Enseigne</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead>Accès Shadow</TableHead>
                    <TableHead className="text-center">Actif</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map(a => (
                    <TableRow key={a.email}>
                      <TableCell>
                        <p className="text-xs font-semibold text-stone-800 dark:text-stone-100">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">{a.email}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{ROLE_LABELS[a.role] ?? a.role}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {a.brandName ? (
                          <span className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: a.brandSlug === "agil" ? "#dc2626" : a.brandSlug === "shell" ? "#d9a514" : a.brandSlug === "ola" ? "#9333ea" : a.brandSlug === "totalenergies" ? "#ea580c" : a.brandSlug === "staroil" ? "#059669" : "#64748b" }}
                              aria-hidden
                            />
                            {a.brandName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Plateforme</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`gap-1 text-[10.5px] ${
                            a.totpEnabled
                              ? "border-[#4CAF50]/40 bg-[#4CAF50]/10 text-[#2E7D32] dark:text-[#a5d6a7]"
                              : "border-stone-300 bg-stone-100 text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400"
                          }`}
                        >
                          <ShieldCheck className="h-3 w-3" aria-hidden />
                          {a.totpEnabled ? "Activée" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[11px] font-medium text-stone-700 dark:text-stone-300">
                        {shadowScopeFor(a)}
                      </TableCell>
                      <TableCell>
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex justify-center">
                                <Switch
                                  checked
                                  onCheckedChange={() => {
                                    toast.info("Démonstration — contrôle de lecture", {
                                      description: `Les accès Shadow de ${a.name} sont gérés par la Super Administration (rôle + enseigne de la session signée) — l'interrupteur est rétabli.`,
                                    })
                                  }}
                                  aria-label={`Accès Shadow de ${a.name} (géré par la Super Administration)`}
                                />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Géré par la Super Administration</p>
                              <p className="text-[11px] text-muted-foreground">Périmètre appliqué côté serveur (session signée).</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-3 flex items-start gap-2 rounded-lg border border-dashed border-stone-300 bg-stone-50 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground dark:border-stone-700 dark:bg-stone-900">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#4CAF50]" aria-hidden />
            Le périmètre est appliqué côté serveur (session signée) — ce volet est un contrôle de lecture : aucune
            modification d&apos;accès n&apos;est possible depuis le module Shadow Market.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
