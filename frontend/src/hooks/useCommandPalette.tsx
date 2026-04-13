import React, { createContext, useContext, useState, useCallback } from 'react'

interface CommandPaletteContextValue {
  commandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  commandPaletteOpen: false,
  openCommandPalette: () => {},
  closeCommandPalette: () => {},
})

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])

  return (
    <CommandPaletteContext.Provider value={{
      commandPaletteOpen, openCommandPalette, closeCommandPalette,
    }}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}
