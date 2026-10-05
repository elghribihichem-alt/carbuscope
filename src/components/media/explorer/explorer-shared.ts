'use client'

// CarbuScope — T60-e — socle partagé de la FAMILLE explorateur (fichiers
// src/components/media/explorer/*). Dictionnaire local fr/en/ar (pattern
// « dict maison » de media-shared), état filtres sérialisable (string —
// sauvegarde API Record<string, string>), helpers purs. AUCUN import serveur.

import type { LocalDict } from "@/components/media/media-shared"

// ─────────────────── Dictionnaire local (fr/en/ar — RTL-ready) ───────────────────

/** Fusion PROFONDE de dictionnaires locaux par langue : contrairement à
 *  `{ ...A, ...B }` (fusion superficielle qui REMPLACE la table fr de A par
 *  celle de B), cette fonction fusionne clé à clé les tables fr/en/ar des
 *  dictionnaires — les clés de B écrasent celles de A en cas de conflit. */
export function mergeDicts(...dicts: LocalDict[]): LocalDict {
  const out: Record<"fr" | "en" | "ar", Record<string, string>> = { fr: {}, en: {}, ar: {} }
  for (const d of dicts) {
    if (!d) continue
    for (const lang of ["fr", "en", "ar"] as const) {
      const table = d[lang]
      if (table) Object.assign(out[lang], table)
    }
  }
  return out
}

export const X_DICT: LocalDict = {
  fr: {
    // — bandeau stats
    "x.stats.visible": "visibles",
    "x.stats.full": "accès complet",
    "x.stats.aggrege": "restreint",
    "x.stats.panneaux": "panneaux",
    "x.stats.filtered": "filtré",
    // — filtres
    "x.filters.title": "Filtres",
    "x.filters.gouvernorat": "Gouvernorat",
    "x.filters.delegation": "Délégation",
    "x.filters.format": "Format",
    "x.filters.technologie": "Technologie",
    "x.filters.statut": "Statut de face",
    "x.filters.support": "Support",
    "x.filters.all": "Tous",
    "x.filters.allF": "Toutes",
    "x.filters.prixMin": "Prix min (DT/sem.)",
    "x.filters.prixMax": "Prix max (DT/sem.)",
    "x.filters.tmjaMin": "TMJA min (véh./j)",
    "x.filters.audienceMin": "Audience min (/j)",
    "x.filters.sovMax": "Part de voix max (%)",
    "x.filters.distanceStationKm": "Distance max station (km)",
    "x.filters.concurrence": "Stations concurrentes à proximité",
    "x.filters.concurrence.oui": "Présentes",
    "x.filters.concurrence.non": "Absentes",
    "x.filters.alcool": "Autorisation alcool",
    "x.filters.alcool.oui": "Autorisé",
    "x.filters.alcool.non": "Interdit",
    "x.filters.reset": "Réinitialiser",
    "x.filters.active": "filtre actif",
    "x.filters.active.pl": "filtres actifs",
    // — filtres sauvegardés
    "x.sf.title": "Filtres sauvegardés",
    "x.sf.empty": "Aucun filtre sauvegardé pour l'instant.",
    "x.sf.save": "Enregistrer ce filtre",
    "x.sf.name": "Nom du filtre",
    "x.sf.namePh": "ex. Grand format Sfax",
    "x.sf.saveBtn": "Enregistrer",
    "x.sf.cancel": "Annuler",
    "x.sf.apply": "Appliquer",
    "x.sf.delete": "Supprimer",
    "x.sf.saved": "Filtre enregistré.",
    "x.sf.deleted": "Filtre supprimé.",
    "x.sf.loadErr": "Impossible de charger les filtres sauvegardés.",
    // — carte
    "x.map.legend": "Légende",
    "x.map.legend.full": "Accès complet",
    "x.map.legend.aggrege": "Visibilité restreinte",
    "x.map.legend.selected": "Face sélectionnée",
    "x.map.select": "Sélectionner",
    "x.map.unselect": "Retirer",
    "x.map.restricted": "Visibilité restreinte",
    "x.map.restrictedHint": "Face en visibilité restreinte — sélection impossible.",
    // — tableau
    "x.tbl.code": "Panneau / Face",
    "x.tbl.orientation": "Orient.",
    "x.tbl.tmja": "TMJA (véh./j)",
    "x.tbl.audience": "Audience/j",
    "x.tbl.odv": "ODV/j",
    "x.tbl.prix": "Prix/sem.",
    "x.tbl.occup": "Occup. 12 m",
    "x.tbl.concur": "Concurrentes",
    "x.tbl.sov": "Part de voix",
    "x.tbl.statut": "Statut",
    "x.tbl.actions": "Actions",
    "x.tbl.faces": "faces",
    "x.tbl.dispo": "dispo",
    "x.tbl.expand": "Déplier / replier les faces du panneau",
    "x.tbl.selectOne": "Sélectionner cette face",
    "x.tbl.selectAll": "Tout sélectionner (filtré)",
    "x.tbl.details": "Détails de la face",
    "x.tbl.compare": "Ajouter au comparateur",
    "x.tbl.compareFull": "Comparateur",
    "x.tbl.empty": "Aucune face ne correspond à ces filtres.",
    "x.tbl.emptyHint": "Élargissez la recherche ou réinitialisez les filtres.",
    "x.tbl.panel": "Panneau",
    "x.tbl.face": "Face",
    // — édition en ligne
    "x.ed.editable": "Éditable — cliquez pour modifier",
    "x.ed.reservedSA": "Réservé Super Administration",
    "x.ed.reservedData": "Donnée réservée",
    "x.ed.computed": "Calculé par le moteur",
    "x.ed.saved": "enregistré",
    "x.ed.saveErr": "Échec de l'édition",
    "x.ed.invalid": "Valeur invalide",
    "x.ed.undo": "Annuler la dernière édition",
    "x.ed.redo": "Rétablir l'édition annulée",
    "x.ed.undoEmpty": "Rien à annuler.",
    "x.ed.redoEmpty": "Rien à rétablir.",
    // — sélection / masse
    "x.sel.selected": "faces sélectionnées",
    "x.sel.selectedF": "face sélectionnée",
    "x.sel.formats": "formats",
    "x.sel.villes": "villes",
    "x.sel.clear": "Vider",
    "x.sel.simulate": "Simuler ces faces",
    "x.sel.bulk": "Édition en masse",
    "x.sel.compare": "Comparer",
    "x.sel.fullOnly": "Les faces en visibilité restreinte ne peuvent pas être sélectionnées.",
    // — masse
    "x.bulk.title": "Édition en masse",
    "x.bulk.desc": "Applique une même valeur à toutes les faces sélectionnées. Chaque ligne modifiée est journalisée (audit).",
    "x.bulk.field": "Champ à modifier",
    "x.bulk.value": "Nouvelle valeur",
    "x.bulk.preview": "Prévisualiser",
    "x.bulk.apply": "Confirmer",
    "x.bulk.count": "face(s) concernée(s)",
    "x.bulk.oldValue": "Ancienne valeur",
    "x.bulk.applied": "faces mises à jour.",
    "x.bulk.previewHint": "Vérifiez les anciennes valeurs avant de confirmer.",
    "x.bulk.needValue": "Saisissez un champ et une valeur.",
    // — comparateur
    "x.cmp.title": "Comparateur de faces",
    "x.cmp.desc": "Score composite pondéré (audience · trafic · prix inversé · part de voix).",
    "x.cmp.score": "Score",
    "x.cmp.best": "Meilleure valeur",
    "x.cmp.worst": "Moins bonne valeur",
    "x.cmp.weights": "Pondérations",
    "x.cmp.weightsNote": "Pondérations modifiables dans Préférences.",
    "x.cmp.empty": "Sélectionnez 2 à 8 faces en accès complet pour comparer.",
    "x.cmp.metric": "Métrique",
    // — handoff
    "x.sim.handoff": "Faces transmises à l'assistant de simulation.",
  },
  en: {
    "x.stats.visible": "visible",
    "x.stats.full": "full access",
    "x.stats.aggrege": "restricted",
    "x.stats.panneaux": "panels",
    "x.stats.filtered": "filtered",
    "x.filters.title": "Filters",
    "x.filters.gouvernorat": "Governorate",
    "x.filters.delegation": "Delegation",
    "x.filters.format": "Format",
    "x.filters.technologie": "Technology",
    "x.filters.statut": "Face status",
    "x.filters.support": "Support",
    "x.filters.all": "All",
    "x.filters.allF": "All",
    "x.filters.prixMin": "Min price (DT/wk)",
    "x.filters.prixMax": "Max price (DT/wk)",
    "x.filters.tmjaMin": "Min TMJA (veh./d)",
    "x.filters.audienceMin": "Min audience (/d)",
    "x.filters.sovMax": "Max share of voice (%)",
    "x.filters.distanceStationKm": "Max distance to station (km)",
    "x.filters.concurrence": "Competing stations nearby",
    "x.filters.concurrence.oui": "Present",
    "x.filters.concurrence.non": "Absent",
    "x.filters.alcool": "Alcohol permission",
    "x.filters.alcool.oui": "Allowed",
    "x.filters.alcool.non": "Forbidden",
    "x.filters.reset": "Reset",
    "x.filters.active": "active filter",
    "x.filters.active.pl": "active filters",
    "x.sf.title": "Saved filters",
    "x.sf.empty": "No saved filter yet.",
    "x.sf.save": "Save this filter",
    "x.sf.name": "Filter name",
    "x.sf.namePh": "e.g. Large format Sfax",
    "x.sf.saveBtn": "Save",
    "x.sf.cancel": "Cancel",
    "x.sf.apply": "Apply",
    "x.sf.delete": "Delete",
    "x.sf.saved": "Filter saved.",
    "x.sf.deleted": "Filter deleted.",
    "x.sf.loadErr": "Could not load saved filters.",
    "x.map.legend": "Legend",
    "x.map.legend.full": "Full access",
    "x.map.legend.aggrege": "Restricted visibility",
    "x.map.legend.selected": "Selected face",
    "x.map.select": "Select",
    "x.map.unselect": "Unselect",
    "x.map.restricted": "Restricted visibility",
    "x.map.restrictedHint": "Restricted face — selection unavailable.",
    "x.tbl.code": "Panel / Face",
    "x.tbl.orientation": "Orient.",
    "x.tbl.tmja": "TMJA (veh./d)",
    "x.tbl.audience": "Audience/d",
    "x.tbl.odv": "DVN/d",
    "x.tbl.prix": "Price/wk",
    "x.tbl.occup": "Occ. 12 m",
    "x.tbl.concur": "Competitors",
    "x.tbl.sov": "Share of voice",
    "x.tbl.statut": "Status",
    "x.tbl.actions": "Actions",
    "x.tbl.faces": "faces",
    "x.tbl.dispo": "free",
    "x.tbl.expand": "Expand / collapse panel faces",
    "x.tbl.selectOne": "Select this face",
    "x.tbl.selectAll": "Select all (filtered)",
    "x.tbl.details": "Face details",
    "x.tbl.compare": "Add to comparator",
    "x.tbl.compareFull": "Comparator",
    "x.tbl.empty": "No face matches these filters.",
    "x.tbl.emptyHint": "Widen your search or reset the filters.",
    "x.tbl.panel": "Panel",
    "x.tbl.face": "Face",
    "x.ed.editable": "Editable — click to modify",
    "x.ed.reservedSA": "Reserved to Super Administration",
    "x.ed.reservedData": "Reserved data",
    "x.ed.computed": "Computed by the engine",
    "x.ed.saved": "saved",
    "x.ed.saveErr": "Edit failed",
    "x.ed.invalid": "Invalid value",
    "x.ed.undo": "Undo last edit",
    "x.ed.redo": "Redo undone edit",
    "x.ed.undoEmpty": "Nothing to undo.",
    "x.ed.redoEmpty": "Nothing to redo.",
    "x.sel.selected": "faces selected",
    "x.sel.selectedF": "face selected",
    "x.sel.formats": "formats",
    "x.sel.villes": "cities",
    "x.sel.clear": "Clear",
    "x.sel.simulate": "Simulate these faces",
    "x.sel.bulk": "Bulk edit",
    "x.sel.compare": "Compare",
    "x.sel.fullOnly": "Restricted-visibility faces cannot be selected.",
    "x.bulk.title": "Bulk edit",
    "x.bulk.desc": "Applies one value to every selected face. Each modified row is journaled (audit).",
    "x.bulk.field": "Field to modify",
    "x.bulk.value": "New value",
    "x.bulk.preview": "Preview",
    "x.bulk.apply": "Confirm",
    "x.bulk.count": "face(s) affected",
    "x.bulk.oldValue": "Old value",
    "x.bulk.applied": "faces updated.",
    "x.bulk.previewHint": "Review the old values before confirming.",
    "x.bulk.needValue": "Pick a field and a value.",
    "x.cmp.title": "Face comparator",
    "x.cmp.desc": "Weighted composite score (audience · traffic · inverted price · share of voice).",
    "x.cmp.score": "Score",
    "x.cmp.best": "Best value",
    "x.cmp.worst": "Worst value",
    "x.cmp.weights": "Weights",
    "x.cmp.weightsNote": "Weights can be changed in Preferences.",
    "x.cmp.empty": "Select 2 to 8 full-access faces to compare.",
    "x.cmp.metric": "Metric",
    "x.sim.handoff": "Faces handed off to the simulation assistant.",
  },
  ar: {
    "x.stats.visible": "مرئية",
    "x.stats.full": "وصول كامل",
    "x.stats.aggrege": "مقيّدة",
    "x.stats.panneaux": "لوحات",
    "x.stats.filtered": "مُصفّاة",
    "x.filters.title": "المرشحات",
    "x.filters.gouvernorat": "الولاية",
    "x.filters.delegation": "المعتمدية",
    "x.filters.format": "المقاس",
    "x.filters.technologie": "التقنية",
    "x.filters.statut": "حالة الوجه",
    "x.filters.support": "الحامل",
    "x.filters.all": "الكل",
    "x.filters.allF": "الكل",
    "x.filters.prixMin": "أدنى سعر (د.ت/أسبوع)",
    "x.filters.prixMax": "أقصى سعر (د.ت/أسبوع)",
    "x.filters.tmjaMin": "أدنى حركة يومية",
    "x.filters.audienceMin": "أدنى جمهور/يوم",
    "x.filters.sovMax": "أقصى حصة صوت (%)",
    "x.filters.distanceStationKm": "أقصى مسافة لمحطة (كم)",
    "x.filters.concurrence": "محطات منافسة قريبة",
    "x.filters.concurrence.oui": "موجودة",
    "x.filters.concurrence.non": "غائبة",
    "x.filters.alcool": "ترخيص الكحول",
    "x.filters.alcool.oui": "مرخّص",
    "x.filters.alcool.non": "ممنوع",
    "x.filters.reset": "إعادة تعيين",
    "x.filters.active": "مرشّح نشط",
    "x.filters.active.pl": "مرشحات نشطة",
    "x.sf.title": "المرشحات المحفوظة",
    "x.sf.empty": "لا توجد مرشحات محفوظة بعد.",
    "x.sf.save": "حفظ هذا المرشّح",
    "x.sf.name": "اسم المرشّح",
    "x.sf.namePh": "مثال: مقاس كبير صفاقس",
    "x.sf.saveBtn": "حفظ",
    "x.sf.cancel": "إلغاء",
    "x.sf.apply": "تطبيق",
    "x.sf.delete": "حذف",
    "x.sf.saved": "تم حفظ المرشّح.",
    "x.sf.deleted": "تم حذف المرشّح.",
    "x.sf.loadErr": "تعذّر تحميل المرشحات المحفوظة.",
    "x.map.legend": "المفتاح",
    "x.map.legend.full": "وصول كامل",
    "x.map.legend.aggrege": "رؤية مقيّدة",
    "x.map.legend.selected": "وجه محدد",
    "x.map.select": "تحديد",
    "x.map.unselect": "إلغاء التحديد",
    "x.map.restricted": "رؤية مقيّدة",
    "x.map.restrictedHint": "وجه برؤية مقيّدة — لا يمكن تحديده.",
    "x.tbl.code": "اللوحة / الوجه",
    "x.tbl.orientation": "التوجّه",
    "x.tbl.tmja": "الحركة اليومية",
    "x.tbl.audience": "الجمهور/يوم",
    "x.tbl.odv": "فرص الرؤية/يوم",
    "x.tbl.prix": "السعر/أسبوع",
    "x.tbl.occup": "الإشغال 12 شهرًا",
    "x.tbl.concur": "المنافسون",
    "x.tbl.sov": "حصة الصوت",
    "x.tbl.statut": "الحالة",
    "x.tbl.actions": "الإجراءات",
    "x.tbl.faces": "أوجه",
    "x.tbl.dispo": "متاحة",
    "x.tbl.expand": "فتح / طيّ أوجه اللوحة",
    "x.tbl.selectOne": "تحديد هذا الوجه",
    "x.tbl.selectAll": "تحديد الكل (مُصفّى)",
    "x.tbl.details": "تفاصيل الوجه",
    "x.tbl.compare": "إضافة إلى المقارن",
    "x.tbl.compareFull": "المقارن",
    "x.tbl.empty": "لا وجه يطابق هذه المرشحات.",
    "x.tbl.emptyHint": "وسّع البحث أو أعد تعيين المرشحات.",
    "x.tbl.panel": "لوحة",
    "x.tbl.face": "وجه",
    "x.ed.editable": "قابل للتعديل — انقر للتعديل",
    "x.ed.reservedSA": "محجوز للإدارة العليا",
    "x.ed.reservedData": "بيانات محجوزة",
    "x.ed.computed": "محسوب بواسطة المحرك",
    "x.ed.saved": "تم الحفظ",
    "x.ed.saveErr": "فشل التعديل",
    "x.ed.invalid": "قيمة غير صالحة",
    "x.ed.undo": "تراجع عن آخر تعديل",
    "x.ed.redo": "إعادة التعديل الملغى",
    "x.ed.undoEmpty": "لا شيء للتراجع عنه.",
    "x.ed.redoEmpty": "لا شيء لإعادته.",
    "x.sel.selected": "أوجه محددة",
    "x.sel.selectedF": "وجه محدد",
    "x.sel.formats": "مقاسات",
    "x.sel.villes": "مدن",
    "x.sel.clear": "تفريغ",
    "x.sel.simulate": "محاكاة هذه الأوجه",
    "x.sel.bulk": "تعديل جماعي",
    "x.sel.compare": "مقارنة",
    "x.sel.fullOnly": "الأوجه برؤية مقيّدة لا يمكن تحديدها.",
    "x.bulk.title": "التعديل الجماعي",
    "x.bulk.desc": "يطبّق نفس القيمة على كل الأوجه المحددة. كل سطر معدّل يُسجّل في التدقيق.",
    "x.bulk.field": "الحقل المراد تعديله",
    "x.bulk.value": "القيمة الجديدة",
    "x.bulk.preview": "معاينة",
    "x.bulk.apply": "تأكيد",
    "x.bulk.count": "وجه(أوجه) معنيّة",
    "x.bulk.oldValue": "القيمة القديمة",
    "x.bulk.applied": "أوجه تم تحديثها.",
    "x.bulk.previewHint": "راجع القيم القديمة قبل التأكيد.",
    "x.bulk.needValue": "اختر حقلًا وقيمة.",
    "x.cmp.title": "مقارن الأوجه",
    "x.cmp.desc": "نتيجة مركّبة مرجّحة (الجمهور · الحركة · السعر معكوس · حصة الصوت).",
    "x.cmp.score": "النتيجة",
    "x.cmp.best": "أفضل قيمة",
    "x.cmp.worst": "أسوأ قيمة",
    "x.cmp.weights": "الأوزان",
    "x.cmp.weightsNote": "يمكن تغيير الأوزان في التفضيلات.",
    "x.cmp.empty": "حدّد من 2 إلى 8 أوجه بوصول كامل للمقارنة.",
    "x.cmp.metric": "المؤشر",
    "x.sim.handoff": "تم تحويل الأوجه إلى مساعد المحاكاة.",
  },
}

// ─────────────────── État filtres (sérialisable en Record<string, string>) ───────────────────

export interface ExplorerFilterState {
  gouvernorat: string
  delegation: string
  format: string
  technologie: string
  statut: string
  support: string
  prixMin: string
  prixMax: string
  tmjaMin: string
  audienceMin: string
  sovMax: string
  distanceStationKm: string
  concurrence: string // "" (indifférent) | "true" | "false"
  alcool: string // "" | "true" | "false"
}

export const EMPTY_FILTERS: ExplorerFilterState = {
  gouvernorat: "", delegation: "", format: "", technologie: "", statut: "", support: "",
  prixMin: "", prixMax: "", tmjaMin: "", audienceMin: "", sovMax: "", distanceStationKm: "",
  concurrence: "", alcool: "",
}

/** Sérialise l'état filtres → record de chaînes (POST /api/media/filters). */
export function filtersToRecord(f: ExplorerFilterState): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(f)) {
    if (v !== "") out[k] = v
  }
  return out
}

/** Reconstruit l'état depuis un record sauvegardé (clés inconnues ignorées). */
export function recordToFilters(rec: Record<string, string>): ExplorerFilterState {
  const out = { ...EMPTY_FILTERS }
  for (const key of Object.keys(EMPTY_FILTERS) as Array<keyof ExplorerFilterState>) {
    const v = rec[key]
    if (typeof v === "string") out[key] = key === "concurrence" || key === "alcool" ? (v === "true" || v === "false" ? v : "") : v
  }
  return out
}

/** Query-string cumulatif pour GET /api/media/faces (seules les valeurs posées partent). */
export function filtersToQuery(f: ExplorerFilterState): string {
  const p = new URLSearchParams()
  const num = (v: string, key: string) => {
    const n = Number(v.replace(",", "."))
    if (v.trim() !== "" && Number.isFinite(n)) p.set(key, String(n))
  }
  if (f.gouvernorat) p.set("gouvernorat", f.gouvernorat)
  if (f.delegation) p.set("delegation", f.delegation)
  if (f.format) p.set("format", f.format)
  if (f.technologie) p.set("technologie", f.technologie)
  if (f.statut) p.set("statut", f.statut)
  if (f.support) p.set("support", f.support)
  num(f.prixMin, "prixMin")
  num(f.prixMax, "prixMax")
  num(f.tmjaMin, "tmjaMin")
  num(f.audienceMin, "audienceMin")
  num(f.sovMax, "sovMax")
  num(f.distanceStationKm, "distanceStationKm")
  if (f.concurrence === "true" || f.concurrence === "false") p.set("concurrence", f.concurrence)
  if (f.alcool === "true" || f.alcool === "false") p.set("alcool", f.alcool)
  return p.toString()
}

/** Nombre de filtres actifs (badge du panneau). */
export function filtersActiveCount(f: ExplorerFilterState): number {
  return Object.values(f).filter(v => v !== "").length
}

// ─────────────────── Opérations d'édition (pile undo/redo) ───────────────────

export interface EditOp {
  faceId: string
  panelId: string
  faceCode: string
  field: string
  oldValue: number | string | boolean | null
  newValue: number | string | boolean | null
}

// ─────────────────── Petits helpers d'affichage ───────────────────

/** Libellé bilingue compact Oui/Non (ar : نعم/لا). */
export function boolLabel(v: boolean | null | undefined, lang: string): string {
  if (v === null || v === undefined) return "—"
  if (lang === "ar") return v ? "نعم" : "لا"
  if (lang === "en") return v ? "Yes" : "No"
  return v ? "Oui" : "Non"
}

/** Couleurs produit du module Média (émeraude / ambre / terracotta / zinc). */
export const X_COLORS = {
  full: "#059669",
  aggrege: "#d97706",
  selected: "#b0563b",
  zinc: "#71717a",
} as const
