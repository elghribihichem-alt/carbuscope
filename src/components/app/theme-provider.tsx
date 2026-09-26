'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

/**
 * Design system « Observatoire du Café » — 4 thèmes, pas de thème système :
 *  - corporate : bleu institutionnel (DÉFAUT du SaaS)
 *  - clair     : blanc + tints beige, focus vert
 *  - light     : « Café » (beige torréfié, :root)
 *  - dark      : « Espresso » (bruns, texte crème)
 */
export const THEMES = ['corporate', 'clair', 'light', 'dark'] as const
export type ThemeName = (typeof THEMES)[number]

export function ThemeProvider(props: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider themes={[...THEMES]} {...props} />
}
