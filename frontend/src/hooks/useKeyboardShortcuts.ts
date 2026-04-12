import { useEffect, useCallback } from 'react'

interface Shortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  action: () => void
  description?: string
}

export function useKeyboardShortcuts(shortcuts: Shortcut[], enabled = true) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!enabled) return
    // Ignore when typing in input/textarea (except Escape)
    const target = e.target as HTMLElement
    const isEditing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

    for (const shortcut of shortcuts) {
      const matchMeta = shortcut.metaKey ? (e.metaKey || e.ctrlKey) : true
      const matchCtrl = shortcut.ctrlKey ? e.ctrlKey : true
      const matchShift = shortcut.shiftKey ? e.shiftKey : !e.shiftKey
      const matchKey = e.key.toLowerCase() === shortcut.key.toLowerCase()

      // Escape always fires, other keys skip when editing
      if (shortcut.key.toLowerCase() === 'escape') {
        if (matchKey) {
          e.preventDefault()
          shortcut.action()
          return
        }
        continue
      }

      if (isEditing) continue

      if (matchKey && (!shortcut.metaKey || e.metaKey || e.ctrlKey) &&
          (!shortcut.ctrlKey || e.ctrlKey) &&
          (!shortcut.shiftKey || e.shiftKey)) {
        // For meta/ctrl combos, check separately
        if ((shortcut.metaKey || shortcut.ctrlKey) && !(e.metaKey || e.ctrlKey)) continue
        if (shortcut.metaKey && !(e.metaKey || e.ctrlKey)) continue
        if (shortcut.ctrlKey && !e.ctrlKey) continue

        e.preventDefault()
        shortcut.action()
        return
      }
    }
  }, [shortcuts, enabled])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
