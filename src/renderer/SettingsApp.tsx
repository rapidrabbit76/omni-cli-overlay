import React, { useEffect } from 'react'
import SettingsPage from './components/SettingsPage'
import { getColors, syncTokensToCss, useThemeStore } from './theme'
import { useSessionStore } from './stores/sessionStore'

export default function SettingsApp() {
  const isDark = useThemeStore((s) => s.isDark)
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const initStaticInfo = useSessionStore((s) => s.initStaticInfo)

  useEffect(() => {
    syncTokensToCss(getColors(isDark))
  }, [isDark])

  useEffect(() => {
    window.oco.getTheme().then(({ isDark: systemIsDark }) => {
      setSystemTheme(systemIsDark)
    }).catch(() => {})

    const unsubscribe = window.oco.onThemeChange((systemIsDark) => {
      setSystemTheme(systemIsDark)
    })

    return unsubscribe
  }, [setSystemTheme])

  useEffect(() => {
    void initStaticInfo()
  }, [initStaticInfo])

  return <SettingsPage />
}
