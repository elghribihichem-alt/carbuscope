// Seed one-shot : réponses d'enseigne sur les avis (C.2.6+) + horodatage de modération.
// Exécution : bun prisma/seed-replies.ts
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

// Réponses réalistes par tranche de note (ton cohérent avec la note donnée)
const REPLIES_HIGH = [
  "Merci pour ce retour élogieux ! Nous transmettrons vos remerciements à l'équipe de la station. Au plaisir de vous revoir bientôt.",
  "Un grand merci pour votre confiance. Votre satisfaction est notre première priorité — à très vite sur nos pistes !",
  "Merci beaucoup pour ce commentaire. Nous sommes ravis que la propreté et l'accueil aient été à la hauteur. Bonne route !",
  "Excellent retour, merci ! C'est ce genre de message qui motive nos équipes au quotidien. N'hésitez pas à revenir.",
  "Merci pour votre fidélité ! Heureux de lire un si bon retour sur ce point de vente. À bientôt chez nous.",
]
const REPLIES_MID = [
  "Merci pour votre retour. Nous prenons bonne note de vos remarques et travaillons avec le gérant de la station pour améliorer l'expérience.",
  "Nous vous remercions de nous avoir signalé cela. Votre retour a été transmis au responsable régional pour mise à niveau du service.",
  "Merci pour ce commentaire. Une partie de vos remarques est déjà en cours de traitement — nous espérons vous proposer mieux très prochainement.",
  "Merci de nous avoir écrit. Nous prenons vos observations au sérieux et suivons ce point avec l'équipe terrain.",
]
const REPLIES_LOW = [
  "Nous sommes sincèrement désolés pour cette expérience. Votre signalement a été remonté à la direction régionale et un plan d'action correctif est en cours sur cette station.",
  "Toutes nos excuses pour ce désagrément. Nous prenons votre retour très au sérieux — la station a été auditée cette semaine et les mesures correctives sont engagées.",
  "Merci de nous avoir alertés, et désolés pour la gêne constatée. Nous avons ouvert une fiche d'action immédiate avec le gérant et vous invitons à nous recontacter si nécessaire.",
  "Nous présentons nos excuses. Ce type de situation n'est pas conforme à nos standards : un contrôle qualité a été planifié et nous vous tenrons informés de son résultat.",
]

const rand = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]

async function main() {
  // --- 1. Réponses d'enseigne : ~32 % des avis, délai réaliste 1-6 jours ---
  const reviews = await db.review.findMany({
    select: { id: true, rating: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })
  const brands = await db.brand.findMany()
  // Répondre surtout aux avis récents (les plus visibles) + un échantillon plus ancien
  const now = Date.now()
  const targets = reviews.filter((_, i) => {
    const isRecent = i >= Math.floor(reviews.length * 0.55)
    return isRecent ? Math.random() < 0.45 : Math.random() < 0.12
  })

  let replies = 0
  for (const r of targets) {
    const pool = r.rating >= 4 ? REPLIES_HIGH : r.rating === 3 ? REPLIES_MID : REPLIES_LOW
    const delayH = 6 + Math.random() * 5 * 24 // 6 h → ~5 jours
    const repliedAt = new Date(Math.min(r.createdAt.getTime() + delayH * 3600_000, now))
    const b = brands[Math.floor(Math.random() * brands.length)]
    await db.review.update({
      where: { id: r.id },
      data: {
        replyText: rand(pool),
        repliedAt,
        repliedBy: `Équipe ${b.name}`,
      },
    })
    replies++
  }
  console.log(`Réponses d'enseigne créées : ${replies} / ${reviews.length} avis`)

  // --- 2. updatedAt des contributions résolues (délai de modération réaliste 2 h → 4 j) ---
  const resolved = await db.contribution.findMany({
    where: { status: { in: ["VALIDATED", "REJECTED"] } },
    select: { id: true, createdAt: true },
  })
  for (const c of resolved) {
    const delayH = 2 + Math.random() * 94
    await db.contribution.update({
      where: { id: c.id },
      data: { updatedAt: new Date(c.createdAt.getTime() + delayH * 3600_000) },
    })
  }
  console.log(`Contributions horodatées : ${resolved.length}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
