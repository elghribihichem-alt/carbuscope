// CarbuScope — T54-B3b — GET /api/franchise/kit : kit d'implantation franchise
// (référentiel GLOBAL de l'enseigne — 12 pièces seedées T54-A1 : JURIDIQUE 3,
// FINANCIER 3, TECHNIQUE 3, FORMATION 3). Route STRICTEMENT ADDITIVE, GET
// ouvert (contenu de référence non sensible — convention « données » du
// projet, comme les GET du Radar).
//
// DÉCISION DOCUMENTÉE (spec T54-B3b) : la PROGRESSION « pièce préparée »
// n'est PAS persistée en base — le modèle FranchiseKitItem est global sans
// enseigne ni champ de progression, et le schéma T54-A1 est GELÉ. La
// progression de la checklist « préparation de dossier » vit donc côté client
// (sessionStorage, clé carbuscope-kit-franchise) et l'UI l'affiche avec la
// note honnête « progression locale à votre session ». Le contenu servi ici
// reste le RÉFÉRENTIEL GLOBAL (12 pièces, ordre de la checklist).

import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const items = await db.franchiseKitItem.findMany({
    orderBy: [{ order: "asc" }],
  })
  return NextResponse.json({
    kit: items.map(i => ({
      id: i.id,
      category: i.category,
      title: i.title,
      description: i.description,
      order: i.order,
      mandatory: i.mandatory,
    })),
  })
}
