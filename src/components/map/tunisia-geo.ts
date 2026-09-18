// CarbuScope — Géométrie de la Tunisie : frontières stylisées, villes, centroïdes de gouvernorats
// Coordonnées [lng, lat] approximatives — rendu cartographique démonstratif.

export type LngLat = [number, number]

/** Frontière continentale (sens horaire depuis Tabarka) */
export const TUNISIA_BORDER: LngLat[] = [
  [8.75, 36.95], // Tabarka
  [9.15, 37.06],
  [9.45, 37.14], // Cap Serrat
  [9.70, 37.23],
  [9.87, 37.30], // Bizerte / Cap Blanc
  [10.02, 37.18],
  [10.10, 37.14],
  [10.28, 37.10], // Ras Sidi Ali el Mekki
  [10.30, 36.95],
  [10.30, 36.80], // La Goulette
  [10.38, 36.85],
  [10.48, 36.95],
  [10.63, 37.02],
  [10.83, 37.06],
  [11.05, 37.03], // Cap Bon — El Haouaria
  [11.00, 36.90],
  [10.95, 36.78],
  [10.86, 36.62],
  [10.80, 36.45], // Nabeul
  [10.73, 36.38],
  [10.65, 36.27],
  [10.60, 36.15],
  [10.63, 35.95],
  [10.63, 35.84], // Sousse
  [10.75, 35.80],
  [10.83, 35.78], // Monastir
  [10.95, 35.65],
  [11.05, 35.52], // Mahdia
  [11.08, 35.40],
  [11.05, 35.25],
  [10.92, 35.05],
  [10.76, 34.85], // Sfax
  [10.55, 34.55],
  [10.30, 34.20],
  [10.11, 33.88], // Gabès
  [10.00, 33.70],
  [10.10, 33.60],
  [10.25, 33.62], // Mareth
  [10.45, 33.52],
  [10.60, 33.52],
  [10.75, 33.50],
  [10.95, 33.45], // Zarzis
  [11.20, 33.40],
  [11.40, 33.38],
  [11.55, 33.35], // Ben Guerdane
  [11.60, 33.15], // Ras Ajdir — frontière Libye
  [11.59, 32.75],
  [11.53, 32.25],
  [11.50, 31.75],
  [11.45, 31.25],
  [11.38, 30.85],
  [11.25, 30.55],
  [11.05, 30.35],
  [10.75, 30.25],
  [10.45, 30.23],
  [10.10, 30.25],
  [9.80, 30.28],
  [9.52, 30.23], // point triple Algérie–Libye–Tunisie
  [9.15, 30.45],
  [8.90, 30.75],
  [8.55, 31.10],
  [8.25, 31.35],
  [8.05, 31.70], // frontière algérienne
  [8.00, 32.40],
  [7.95, 33.00],
  [8.05, 33.50],
  [8.15, 33.95],
  [8.35, 34.30],
  [8.60, 35.00],
  [8.45, 35.25],
  [8.30, 35.50],
  [8.55, 35.80],
  [8.25, 36.00],
  [8.30, 36.30],
  [8.60, 36.45],
  [8.45, 36.65],
]

/** Île de Djerba */
export const DJERBA: LngLat[] = [
  [10.72, 33.86],
  [10.82, 33.85],
  [10.92, 33.80],
  [10.97, 33.72],
  [10.93, 33.62],
  [10.85, 33.60],
  [10.78, 33.66],
  [10.72, 33.72],
  [10.70, 33.79],
]

/** Îles Kerkennah */
export const KERKENNAH: LngLat[] = [
  [10.98, 34.82],
  [11.08, 34.78],
  [11.15, 34.72],
  [11.10, 34.66],
  [11.00, 34.68],
  [10.93, 34.75],
]

/** Villes principales : [nom, lng, lat, majeure] */
export const CITIES: [string, number, number, boolean][] = [
  ["Tunis", 10.18, 36.80, true],
  ["Bizerte", 9.87, 37.27, false],
  ["Nabeul", 10.74, 36.45, false],
  ["Zaghouan", 10.14, 36.40, false],
  ["Sousse", 10.63, 35.83, true],
  ["Monastir", 10.83, 35.78, false],
  ["Kairouan", 10.09, 35.68, false],
  ["Mahdia", 11.06, 35.50, false],
  ["Sfax", 10.76, 34.74, true],
  ["Gabès", 10.11, 33.89, false],
  ["Gafsa", 8.78, 34.42, false],
  ["Tozeur", 8.13, 33.92, false],
  ["Kébili", 8.77, 33.70, false],
  ["Médenine", 10.50, 33.35, false],
  ["Tataouine", 10.92, 32.93, false],
  ["Kasserine", 8.83, 35.17, false],
  ["Sidi Bouzid", 9.48, 35.38, false],
  ["Le Kef", 8.70, 36.17, false],
  ["Siliana", 9.37, 36.08, false],
  ["Béja", 9.18, 36.72, false],
  ["Jendouba", 8.78, 36.50, false],
  ["Houmt Souk", 10.86, 33.88, false],
]

/** Centroïdes de gouvernorats (villes chefs-lieux) */
export const GOV_CENTERS: Record<string, LngLat> = {
  "Tunis": [10.18, 36.80],
  "Ariana": [10.19, 36.86],
  "Ben Arous": [10.23, 36.75],
  "Nabeul": [10.74, 36.45],
  "Sfax": [10.76, 34.74],
  "Sousse": [10.63, 35.83],
  "Monastir": [10.83, 35.78],
  "Mahdia": [11.06, 35.50],
  "Bizerte": [9.87, 37.27],
  "Kairouan": [10.09, 35.68],
  "Zaghouan": [10.14, 36.40],
  "Béja": [9.18, 36.72],
  "Jendouba": [8.78, 36.50],
  "Le Kef": [8.70, 36.17],
  "Siliana": [9.37, 36.08],
  "Sidi Bouzid": [9.48, 35.38],
  "Kasserine": [8.83, 35.17],
  "Gabès": [10.11, 33.89],
  "Médenine": [10.50, 33.35],
  "Tataouine": [10.92, 32.93],
  "Gafsa": [8.78, 34.42],
  "Tozeur": [8.13, 33.92],
  "Kébili": [8.77, 33.70],
  "Manouba": [10.10, 36.81],
}
