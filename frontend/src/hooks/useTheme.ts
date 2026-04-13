import { useState, useEffect, useCallback } from 'react'

export type ThemePref = 'system' | 'dark' | 'light'
type Theme = 'dark' | 'light'

function getSystemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => {
    const stored = localStorage.getItem('theme')
    if (stored === 'dark' || stored === 'light' || stored === 'system') return stored
    return 'system'
  })

  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addListener(handler)
    return () => mq.removeListener(handler)
  }, [])

  const effectiveTheme: Theme = pref === 'system' ? systemTheme : pref

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', effectiveTheme)
  }, [effectiveTheme])

  useEffect(() => {
    localStorage.setItem('theme', pref)
  }, [pref])

  const toggleTheme = useCallback(() => {
    setPref((prev) => {
      if (prev === 'system') return 'dark'
      if (prev === 'dark') return 'light'
      return 'system'
    })
  }, [])

  return { theme: effectiveTheme, pref, toggleTheme }
}
