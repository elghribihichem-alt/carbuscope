// Seed one-shot : notifications in-app enseigne (C.2.6+).
// Crée un fil réaliste de notifications par enseigne, aligné sur l'historique
// des passes du moteur de veille (AlertRun seedées) : chaque alerte déclenchée
// dans une passe passée a laissé une notification in-app, la plupart déjà lues,
// les plus récentes non lues (badge portail).
// Exécution : bun prisma/seed-notifications.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

type AlertRunDetailLite = {
  alertId?: string
  brandSlug: string
  status: string
  exceedCount: number
  stationLabel: string
}

type SeedExtra = {
  brandSlug: string
  title: string
  body: string
  stationLabel: string | null
  deltaPoints: number | null
  ageHours: number
  read: boolean
  kind?: string
}

const round1 = (n: number) => Math.round(n * 10) / 10

async function main() {
  await db.notification.deleteMany()

  const runs = await db.alertRun.findMany({
    orderBy: { ranAt: "desc" },
    take: 10,
    select: { id: true, ranAt: true, details: true },
  })

  const created: {
    brandSlug: string; kind: string; title: string; body: string
    stationLabel: string | null; deltaPoints: number | null
    alertRunId: string | null; read: boolean; createdAt: Date
  }[] = []

  // 1) Notifications dérivées des passes réellement seedées (poids du réel).
  // Chaque passe passe + détail TRIGGERED → notification de l'âge de la passe.
  // Lues si plus vieilles que 48 h (l'enseigne a consulté), non lues sinon.
  for (const run of runs) {
    const details = (run.details as unknown as AlertRunDetailLite[] | null) ?? []
    for (const d of details) {
      if (d.status !== "TRIGGERED") continue
      const ageHours = (Date.now() - run.ranAt.getTime()) / 3600_000
      created.push({
        brandSlug: d.brandSlug,
        kind: "WATCHLIST",
        title: d.exceedCount === 1
          ? "Veille des notes : 1 station en perte de vitesse"
          : `Veille des notes : ${d.exceedCount} stations en perte de vitesse`,
        body: `Le moteur de veille a déclenché l'email « ${d.stationLabel } » (${d.exceedCount} station${d.exceedCount > 1 ? "s" : ""} au-dessus du seuil). Consultez la surveillance des notes pour auditer la situation et répondre aux avis défavorables.`,
        stationLabel: d.stationLabel,
        deltaPoints: null,
        alertRunId: run.id,
        read: ageHours > 48,
        createdAt: run.ranAt,
      })
    }
  }

  // 2) Quelques notifications éditoriales récentes par enseigne (ton plateforme),
  // pour animer le centre de notifications au-delà des seules passes du moteur.
  const extras: SeedExtra[] = [
    {
      brandSlug: "agil",
      title: "Nouvel avis défavorable sur Agil El Ouardia 2",
      body: "Un avis 2★ (« files d'attente interminables le vendredi ») fait chuter la note à 3,5 (−1,5 pt sur 90 jours). Une réponse officielle est attendue sous 48 h.",
      stationLabel: "Agil El Ouardia 2",
      deltaPoints: 1.5,
      ageHours: 6,
      read: false,
    },
    {
      brandSlug: "agil",
      title: "Votre rapport mensuel de réputation est prêt",
      body: "L'IVE Agil progresse de 57 à 59/100 ce mois-ci (+2 pt), porté par le taux de réponse qui atteint 84 %. Le rapport complet est exportable depuis l'onglet Avis & réputation.",
      stationLabel: null,
      deltaPoints: null,
      ageHours: 30,
      read: false,
    },
    {
      brandSlug: "shell",
      title: "Nouvel avis défavorable sur Shell Lac 2",
      body: "Un avis 2★ (« terminal de paiement hors service ») fait chuter la note de la station sous le seuil de surveillance. Une réponse officielle est conseillée.",
      stationLabel: "Shell Lac 2",
      deltaPoints: 1.2,
      ageHours: 12,
      read: false,
    },
    {
      brandSlug: "ola",
      title: "3 stations ont quitté votre watchlist",
      body: "Bonne nouvelle : trois stations précédemment surveillées sont repassées au-dessus du seuil grâce à l'amélioration de leurs notes récentes.",
      stationLabel: null,
      deltaPoints: null,
      ageHours: 50,
      read: true,
    },
    {
      brandSlug: "totalenergies",
      title: "Passe de veille nocturne terminée",
      body: "La passe planifiée de 08:00 a couvert 6 enseignes et 12 alertes : 6 emails envoyés, 56 stations signalées. Détail complet dans le back-office.",
      stationLabel: null,
      deltaPoints: null,
      ageHours: 70,
      read: true,
      kind: "SYSTEM",
    },
  ]
  for (const e of extras) {
    created.push({
      brandSlug: e.brandSlug,
      kind: e.kind ?? "WATCHLIST",
      title: e.title,
      body: e.body,
      stationLabel: e.stationLabel,
      deltaPoints: e.deltaPoints,
      alertRunId: null,
      read: e.read,
      createdAt: new Date(Date.now() - e.ageHours * 3600_000),
    })
  }

  // Plafonnement du fil par enseigne (30 max, on garde les plus récentes).
  const byBrand = new Map<string, typeof created>()
  for (const n of created) {
    const arr = byBrand.get(n.brandSlug) ?? []
    arr.push(n)
    byBrand.set(n.brandSlug, arr)
  }
  const finalRows: typeof created = []
  for (const arr of byBrand.values()) {
    arr.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    finalRows.push(...arr.slice(0, 30))
  }

  await db.notification.createMany({ data: finalRows })

  const counts = new Map<string, { total: number; unread: number }>()
  for (const n of finalRows) {
    const c = counts.get(n.brandSlug) ?? { total: 0, unread: 0 }
    c.total++
    if (!n.read) c.unread++
    counts.set(n.brandSlug, c)
  }
  console.log(`Notifications créées : ${finalRows.length}`)
  for (const [slug, c] of counts) {
    console.log(`  ${slug}: ${c.total} notifs, ${c.unread} non lues`)
  }
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
