// Seed one-shot : module veille terrain (T28) — agents de zone, missions de
// contrôle (fiche propriétaire) et missions de veille concurrentielle (fiche
// concurrent), rapports de visite réalistes alignés sur les prix en vigueur
// (ES 2 650 / GA 1 885 / GPL 780 millimes — registre des décrets).
// Exécution : bun prisma/seed-field-missions.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 3600 * 1000)

async function main() {
  console.log("→ Purge de l'ancien jeu (missions → tâches → rapports, puis agents)…")
  await db.mission.deleteMany()
  await db.fieldAgent.deleteMany()

  console.log("→ Création des agents de zone…")
  const agents = await Promise.all([
    db.fieldAgent.create({ data: { code: "AGIL-TUN-01", name: "Karim Ben Salah", phone: "+216 98 123 456", brandSlug: "agil", zone: "Tunis", createdAt: daysAgo(120) } }),
    db.fieldAgent.create({ data: { code: "AGIL-SFX-02", name: "Ines Trabelsi", phone: "+216 97 234 567", brandSlug: "agil", zone: "Sfax", createdAt: daysAgo(90) } }),
    db.fieldAgent.create({ data: { code: "TOT-TUN-03", name: "Mehdi Aloui", phone: "+216 96 345 678", brandSlug: "totalenergies", zone: "Ariana", createdAt: daysAgo(200) } }),
    db.fieldAgent.create({ data: { code: "TOT-SOU-04", name: "Sonia Khelifi", phone: "+216 95 456 789", brandSlug: "totalenergies", zone: "Sousse", createdAt: daysAgo(75) } }),
    db.fieldAgent.create({ data: { code: "SHE-TUN-05", name: "Anis Gharbi", phone: "+216 94 567 890", brandSlug: "shell", zone: "Tunis", createdAt: daysAgo(150) } }),
    db.fieldAgent.create({ data: { code: "OLA-GBS-06", name: "Rim Mansouri", phone: "+216 93 678 901", brandSlug: "ola", zone: "Gabès", createdAt: daysAgo(60) } }),
  ])
  const [agilTun, agilSfx, totTun, totSou, sheTun] = agents
  console.log(`   ${agents.length} agents créés (Agil ×2, TotalEnergies ×2, Shell, Ola).`)

  type TaskSeed = {
    stationCode?: string
    stationName: string
    competitorSlug?: string
    targetLabel: string
    lat?: number
    lng?: number
    taskType?: string
    status?: string
    report?: Record<string, unknown>
  }

  const mkMission = async (
    data: {
      title: string; type: string; brandSlug: string
      agentId: string | null; zone: string; status: string
      dueDays?: number; createdDays: number; instructions: string
    },
    tasks: TaskSeed[],
  ) => {
    const mission = await db.mission.create({
      data: {
        title: data.title,
        type: data.type,
        brandSlug: data.brandSlug,
        agentId: data.agentId,
        zone: data.zone,
        status: data.status,
        dueDate: data.dueDays !== undefined ? daysAgo(-data.dueDays) : null,
        instructions: data.instructions,
        createdAt: daysAgo(data.createdDays),
      },
    })
    for (const t of tasks) {
      const task = await db.missionTask.create({
        data: {
          missionId: mission.id,
          stationCode: t.stationCode ?? null,
          stationName: t.stationName,
          competitorSlug: t.competitorSlug ?? null,
          targetLabel: t.targetLabel,
          lat: t.lat ?? null,
          lng: t.lng ?? null,
          taskType: t.taskType ?? "CONTROLE_STATION",
          status: t.status ?? "TODO",
        },
      })
      if (t.report) {
        await db.visitReport.create({
          data: {
            taskId: task.id,
            agentId: data.agentId ?? agents[0].id,
            stationCode: t.stationCode ?? null,
            ...(t.report as Record<string, never>),
          } as never,
        })
      }
    }
    return mission
  }

  console.log("→ Missions de contrôle (fiche propriétaire)…")

  // M1 — Contrôle réseau Agil Tunis (en cours, 2 rapports remontés)
  await mkMission(
    {
      title: "Contrôle trimestriel — stations Agil du Grand Tunis",
      type: "CONTROLE", brandSlug: "agil", agentId: agilTun.id, zone: "Tunis",
      status: "EN_COURS", createdDays: 9, dueDays: 3,
      instructions:
        "Vérifier la conformité visuelle de l'enseigne (signalétique, propreté, aires), les prix affichés face au décret en vigueur, l'état des pistes et la disponibilité des services annoncés. Photographier toute anomalie et consigner le personnel présent.",
    },
    [
      {
        stationCode: "TN-0008", stationName: "Agil Tunis Centre", targetLabel: "TN-0008 · Agil Tunis Centre",
        lat: 36.7, lng: 10.2, status: "FAITE",
        report: {
          queueMinutes: 6, staffCount: 4, cleanliness: 4, complianceScore: 92,
          anomalies: "", notes: "Station conforme. Pistes propres, signalétique neuve.",
          gazolePrice: 1885, essencePrice: 2650, gplPrice: 780, createdAt: daysAgo(8),
        },
      },
      {
        stationCode: "TN-0025", stationName: "Agil El Menzah 1", targetLabel: "TN-0025 · Agil El Menzah 1",
        lat: 36.9, lng: 10.2, status: "ANOMALIE",
        report: {
          queueMinutes: 22, staffCount: 2, cleanliness: 2, complianceScore: 61,
          anomalies: "Pompe 3 hors service non signalée. Prix GPL non affiché. Aire de lavage fermée sans justification.",
          notes: "Clients mécontents — 22 min d'attente constatées à 18h. Réclamations orales de 3 clients.",
          createdAt: daysAgo(7),
        },
      },
      {
        stationCode: "TN-0042", stationName: "Agil La Goulette", targetLabel: "TN-0042 · Agil La Goulette",
        lat: 36.8, lng: 10.3,
      },
      {
        stationCode: "TN-0049", stationName: "Agil La Marsa", targetLabel: "TN-0049 · Agil La Marsa",
        lat: 36.9, lng: 10.3,
      },
    ],
  )

  // M2 — Contrôle réseau Agil Sfax (terminée)
  await mkMission(
    {
      title: "Contrôle mensuel — stations Agil de Sfax",
      type: "CONTROLE", brandSlug: "agil", agentId: agilSfx.id, zone: "Sfax",
      status: "TERMINEE", createdDays: 25, dueDays: -8,
      instructions: "Ronde de conformité mensuelle des stations de la zone de Sfax.",
    },
    [
      {
        stationCode: "TN-0141", stationName: "Agil Sfax Centre", targetLabel: "TN-0141 · Agil Sfax Centre",
        lat: 34.74, lng: 10.76, status: "FAITE",
        report: {
          queueMinutes: 4, staffCount: 5, cleanliness: 5, complianceScore: 97,
          anomalies: "", notes: "Exemplaire. Rien à signaler.",
          createdAt: daysAgo(24),
        },
      },
      {
        stationCode: "TN-0150", stationName: "Agil Sfax Sakiet Ezzit", targetLabel: "TN-0150 · Agil Sfax Sakiet Ezzit",
        lat: 34.79, lng: 10.71, status: "FAITE",
        report: {
          queueMinutes: 9, staffCount: 3, cleanliness: 4, complianceScore: 84,
          anomalies: "Lampes d'enseigne grillées sur le panneau latéral.",
          notes: "Remplacement demandé à la maintenance.",
          createdAt: daysAgo(23),
        },
      },
      {
        stationCode: "TN-0162", stationName: "Agil Sfax Thyna", targetLabel: "TN-0162 · Agil Sfax Thyna",
        lat: 34.7, lng: 10.69, status: "FAITE",
        report: {
          queueMinutes: 3, staffCount: 3, cleanliness: 4, complianceScore: 89,
          anomalies: "", notes: "Conforme.",
          createdAt: daysAgo(23),
        },
      },
    ],
  )

  // M3 — Contrôle TotalEnergies Ariana (en cours)
  await mkMission(
    {
      title: "Contrôle qualité de service — TotalEnergies Ariana",
      type: "CONTROLE", brandSlug: "totalenergies", agentId: totTun.id, zone: "Ariana",
      status: "EN_COURS", createdDays: 5, dueDays: 6,
      instructions: "Focus propreté des sanitaires et accueil client. Conformité café/vidange.",
    },
    [
      {
        stationCode: "TN-0019", stationName: "TotalEnergies Ariana Centre", targetLabel: "TN-0019 · TotalEnergies Ariana Centre",
        lat: 36.86, lng: 10.19, status: "FAITE",
        report: {
          queueMinutes: 7, staffCount: 4, cleanliness: 5, complianceScore: 94,
          anomalies: "", notes: "Accueil excellent, sanitaires impeccables.",
          createdAt: daysAgo(4),
        },
      },
      {
        stationCode: "TN-0175", stationName: "TotalEnergies Ariana Ennasr", targetLabel: "TN-0175 · TotalEnergies Ariana Ennasr",
        lat: 36.9, lng: 10.17,
      },
    ],
  )

  console.log("→ Missions de veille concurrentielle (fiche concurrent)…")

  // M4 — Veille Shell dans le Grand Tunis (commanditaire Agil)
  await mkMission(
    {
      title: "Veille concurrentielle — Shell Grand Tunis",
      type: "VEILLE_CONCURRENT", brandSlug: "agil", agentId: agilTun.id, zone: "Tunis",
      status: "EN_COURS", createdDays: 6, dueDays: 2,
      instructions:
        "Observer les stations Shell de la zone : affluence, praticité, promotions éventuelles, état des pistes, prix affichés face au décret. NE PAS interagir avec le personnel — observation discrète depuis l'aire client.",
    },
    [
      {
        stationCode: "TN-0004", stationName: "Shell El Menzah 4", competitorSlug: "shell",
        targetLabel: "Shell El Menzah 4 (TN-0004)", lat: 36.8, lng: 10.2,
        taskType: "VEILLE_CONCURRENT", status: "FAITE",
        report: {
          queueMinutes: 11, staffCount: 5, cleanliness: 4,
          gazolePrice: 1885, essencePrice: 2650,
          competitorPractices: "Nouvelle signalétique LED. Café 7 versus notre 8. File fluide malgré l'affluence du soir.",
          notes: "Station rénovée récemment — très visible depuis l'avenue.",
          createdAt: daysAgo(5),
        },
      },
      {
        stationCode: "TN-0040", stationName: "Shell El Kabaria", competitorSlug: "shell",
        targetLabel: "Shell El Kabaria (TN-0040)", lat: 36.8, lng: 10.1,
        taskType: "VEILLE_CONCURRENT",
      },
      {
        stationCode: "TN-0085", stationName: "Shell La Marsa", competitorSlug: "shell",
        targetLabel: "Shell La Marsa (TN-0085)", lat: 36.9, lng: 10.3,
        taskType: "VEILLE_CONCURRENT",
      },
    ],
  )

  // M5 — Veille Agil à Sousse (commanditaire TotalEnergies)
  await mkMission(
    {
      title: "Veille concurrentielle — Agil côte de Sousse",
      type: "VEILLE_CONCURRENT", brandSlug: "totalenergies", agentId: totSou.id, zone: "Sousse",
      status: "PLANIFIEE", createdDays: 2, dueDays: 5,
      instructions: "Relever les prix affichés et l'affluence aux heures de pointe sur 3 stations Agil.",
    },
    [
      {
        stationCode: "TN-0096", stationName: "Agil Sousse Centre", competitorSlug: "agil",
        targetLabel: "Agil Sousse Centre (TN-0096)", lat: 35.83, lng: 10.64,
        taskType: "VEILLE_CONCURRENT",
      },
      {
        stationCode: "TN-0101", stationName: "Agil Sousse Kantaoui", competitorSlug: "agil",
        targetLabel: "Agil Sousse Kantaoui (TN-0101)", lat: 35.75, lng: 10.68,
        taskType: "VEILLE_CONCURRENT",
      },
    ],
  )

  // M6 — Veille TotalEnergies à Tunis (commanditaire Shell) — rapport remonté
  await mkMission(
    {
      title: "Veille — TotalEnergies axe El Menzah",
      type: "VEILLE_CONCURRENT", brandSlug: "shell", agentId: sheTun.id, zone: "Tunis",
      status: "EN_COURS", createdDays: 4, dueDays: 4,
      instructions: "Confronter notre file d'attente à celle de TotalEnergies aux mêmes créneaux.",
    },
    [
      {
        stationCode: "TN-0023", stationName: "TotalEnergies El Menzah 6", competitorSlug: "totalenergies",
        targetLabel: "TotalEnergies El Menzah 6 (TN-0023)", lat: 36.87, lng: 10.18,
        taskType: "VEILLE_CONCURRENT", status: "FAITE",
        report: {
          queueMinutes: 8, staffCount: 4, cleanliness: 4,
          competitorPractices: "2 pompes self-service ouvertes — débit client supérieur au nôtre à 17h30.",
          notes: "Aire conviviale, clientèle fidèle bureaux.",
          createdAt: daysAgo(3),
        },
      },
      {
        stationCode: "TN-0035", stationName: "TotalEnergies La Marsa Plage", competitorSlug: "totalenergies",
        targetLabel: "TotalEnergies La Marsa Plage (TN-0035)", lat: 36.88, lng: 10.29,
        taskType: "VEILLE_CONCURRENT",
      },
    ],
  )

  const counts = {
    missions: await db.mission.count(),
    tasks: await db.missionTask.count(),
    reports: await db.visitReport.count(),
    agents: await db.fieldAgent.count(),
  }
  console.log(`✔ Seed veille terrain terminé : ${JSON.stringify(counts)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
