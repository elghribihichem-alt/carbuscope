'use client'

// T55-C-b — Hubs > Paramètres TMP › « maintenance » (équipements). Seuils
// d'entretien par équipement — V1 STATIQUE documentée : contrôle réglementaire
// du pont élévateur (12 mois) + révision hydraulique (5 ans), vidange
// compresseur (6 mois), calibration équilibrage (12 mois), MAJ diagnostiqueur
// (3 mois), nettoyage extracteur (3 mois). Grille DataViews INDICATIVE sans
// date (V1) + KPI « contrôles/an estimés » calculé depuis le nombre réel de
// hubs actifs (useHubs aggregate.active × 12 contrôles/an/hub).

import { useMemo } from "react"
import { CalendarClock, ShieldAlert, Wrench } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DataViews } from "@/components/ui/data-views"
import type { DataViewColumn } from "@/components/ui/data-views"
import { KpiCard } from "@/components/shell/kpi-card"
import { SectionHeader } from "@/components/radar/radar-shared"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"
import { useHubs } from "./hubs-shared"

// ---------- Seuils V1 (statique, documenté) ----------

type Criticite = "HAUTE" | "MOYENNE" | "NORMALE"

interface EquipementRow {
  id: string
  equipement: string
  operation: string
  periodicite: string
  /** périodicité en mois (pour le décompte des contrôles/an) */
  periodiciteMois: number
  complement: string | null
  criticite: Criticite
}

const CRITICITE_META: Record<Criticite, { label: string; badge: string }> = {
  HAUTE: {
    label: "Haute — sécurité",
    badge: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400",
  },
  MOYENNE: {
    label: "Moyenne — qualité",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  NORMALE: {
    label: "Normale — bon fonctionnement",
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
}

const EQUIPEMENTS: EquipementRow[] = [
  {
    id: "pont",
    equipement: "Pont élévateur 2 colonnes",
    operation: "Contrôle réglementaire",
    periodicite: "12 mois",
    periodiciteMois: 12,
    complement: "révision hydraulique tous les 5 ans",
    criticite: "HAUTE",
  },
  {
    id: "compresseur",
    equipement: "Compresseur d'air",
    operation: "Vidange huile compresseur",
    periodicite: "6 mois",
    periodiciteMois: 6,
    complement: "purge du réservoir hebdomadaire (geste quotidien)",
    criticite: "MOYENNE",
  },
  {
    id: "equilibrage",
    equipement: "Machine d'équilibrage",
    operation: "Calibration",
    periodicite: "12 mois",
    periodiciteMois: 12,
    complement: "contrôle de faux-roue à chaque reprogrammation",
    criticite: "MOYENNE",
  },
  {
    id: "diagnostiqueur",
    equipement: "Diagnostiqueur électronique",
    operation: "Mise à jour logicielle",
    periodicite: "3 mois",
    periodiciteMois: 3,
    complement: "mise à jour des véhicules récents constructeurs",
    criticite: "NORMALE",
  },
  {
    id: "extracteur",
    equipement: "Extracteur d'huile",
    operation: "Nettoyage & filtre",
    periodicite: "3 mois",
    periodiciteMois: 3,
    complement: "vidange complète du bac de récupération",
    criticite: "NORMALE",
  },
]

export function HubsParametresMaintenance() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const { data: hubsData } = useHubs(brandSlug)

  // Contrôles/an estimés : somme des périodicités ramenée à l'année
  // (pont 1 + compresseur 2 + équilibrage 1 + diagnostiqueur 4 +
  // extracteur 4 = 12 contrôles/an/hub) × hubs ACTIFS du périmètre (réel).
  const controlesParAnParHub = useMemo(
    () => EQUIPEMENTS.reduce((s, e) => s + 12 / e.periodiciteMois, 0),
    [],
  )
  const hubsActifs = hubsData?.aggregate.active ?? 0
  const controlesAnnuels = Math.round(controlesParAnParHub * hubsActifs)

  const columns = useMemo<DataViewColumn<EquipementRow>[]>(() => [
    {
      key: "equipement",
      header: "Équipement",
      sortValue: r => r.equipement,
      render: r => (
        <div className="min-w-0">
          <p className="font-medium">{r.equipement}</p>
          <p className="text-xs text-muted-foreground">{r.operation}</p>
        </div>
      ),
    },
    {
      key: "periodicite",
      header: "Périodicité",
      sortValue: r => r.periodiciteMois,
      render: r => (
        <span className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold tabular-nums">
          <CalendarClock className="h-4 w-4 text-muted-foreground" aria-hidden />
          {r.periodicite}
        </span>
      ),
    },
    {
      key: "complement",
      header: "Complément",
      render: r => (
        <span className="text-xs text-muted-foreground">{r.complement ?? "—"}</span>
      ),
      hideInCards: true,
    },
    {
      key: "echeance",
      header: "Prochaine échéance",
      align: "center",
      render: () => (
        <Badge variant="outline" className="border-stone-300 bg-stone-50 text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">
          à planifier
        </Badge>
      ),
    },
    {
      key: "criticite",
      header: "Criticité",
      sortValue: r => ({ HAUTE: 3, MOYENNE: 2, NORMALE: 1 })[r.criticite],
      render: r => <Badge variant="outline" className={CRITICITE_META[r.criticite].badge}>{CRITICITE_META[r.criticite].label}</Badge>,
    },
  ], [])

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Maintenance des équipements TMP"
        description="Seuils d'entretien des 5 équipements critiques d'un micro-hub (V1, valeurs constructeur indicatives) : périodicités, opérations complémentaires et criticité. Le suivi daté par hub (planning d'échéances) arrive en V2."
        icon={Wrench}
        badge="V1 indicative"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Équipements suivis" value={num(EQUIPEMENTS.length)} sub="par micro-hub standard" icon={Wrench} />
        <KpiCard
          label="Contrôles / an estimés"
          value={hubsData ? num(controlesAnnuels) : "…"}
          sub={`${num(hubsActifs)} hubs actifs × ${num(Math.round(controlesParAnParHub))} contrôles/an — estimé`}
          icon={CalendarClock}
          tone="warning"
        />
        <KpiCard
          label="Criticité haute"
          value={num(EQUIPEMENTS.filter(e => e.criticite === "HAUTE").length)}
          sub="pont élévateur — sécurité réglementaire"
          icon={ShieldAlert}
          tone="danger"
        />
        <KpiCard
          label="Rappel le plus fréquent"
          value="3 mois"
          sub="diagnostiqueur & extracteur d'huile"
          icon={CalendarClock}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Grille des seuils d'entretien</CardTitle>
          <CardDescription>
            Table indicative V1 — sans date par hub : chaque franchisé planifie ses échéances dans son carnet
            d'atelier (la colonne « prochaine échéance » servira de planning réel en V2).
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-3">
          <DataViews
            columns={columns}
            rows={EQUIPEMENTS}
            rowKey={r => r.id}
            viewKey="hubs-parametres-maintenance"
            maxHeightClassName="max-h-96"
            emptyMessage="Aucun équipement suivi."
          />
          <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            Estimation annuelle : somme des fréquences par équipement ({EQUIPEMENTS.map(e => `${12 / e.periodiciteMois}/an`).join(" + ")}
            {" "}soit {num(Math.round(controlesParAnParHub))} contrôles/an et par hub) × nombre de hubs ACTIFS du périmètre
            {hubsData ? ` (${num(hubsActifs)} actifs sur ${num(hubsData.aggregate.hubs)})` : ""} ≈ {num(controlesAnnuels)} contrôles/an
            pour le réseau. Le contrôle réglementaire du pont élévateur est une exigence de sécurité (arrêté
            équipements sous pression) — sa criticité est classée haute.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
