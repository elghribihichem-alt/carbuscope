import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
async function main() {
  const users = await db.user.findMany({ select: { email: true, role: true, active: true, brandSlug: true } })
  for (const u of users) console.log(`${u.email} | ${u.role} | ${u.active ? "ACTIF" : "SUSP"} | ${u.brandSlug ?? "-"}`)
  const contracts = await db.saasContract.findMany({ select: { brandSlug: true, brandName: true, status: true, plan: true, monthlyFee: true } })
  for (const c of contracts) console.log(`CONTRACT: ${c.brandSlug} | ${c.brandName} | ${c.status} | ${c.plan} | ${c.monthlyFee} DT`)
}
main().then(() => db.$disconnect())
