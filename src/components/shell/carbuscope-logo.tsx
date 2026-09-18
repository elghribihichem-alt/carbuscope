'use client'

import * as React from "react"

export function CarbuscopeLogo({ size = 34, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="cbs-grad" x1="10" y1="4" x2="38" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#10b981" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
      </defs>
      <path d="M24 4C15.7 4 9 10.7 9 19c0 10.2 13 23.5 14.2 24.7a1.2 1.2 0 0 0 1.6 0C26 42.5 39 29.2 39 19c0-8.3-6.7-15-15-15Z" fill="url(#cbs-grad)" />
      <path d="M24 12c-3.9 0-7 3.1-7 7 0 4.8 5.6 11 6.3 11.8a1 1 0 0 0 1.4 0C25.4 30 31 23.8 31 19c0-3.9-3.1-7-7-7Z" fill="#ffffff" fillOpacity="0.94" />
      <path d="M24 14.6c-1.05 1.65-2.6 3.7-2.6 5.3a2.6 2.6 0 0 0 5.2 0c0-1.6-1.55-3.65-2.6-5.3Z" fill="#d97706" />
    </svg>
  )
}
