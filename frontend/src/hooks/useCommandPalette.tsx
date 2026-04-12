import React, { createContext, useContext, useState, useCallback } from 'react'
import type { CommandItem } from '../components/ui/CommandPalette'

interface CommandPaletteContextValue {
  commandPaletteOpen: boolean
  openCommandPalette: () => void
  closeCommandPalette: () => void
  commandItems: CommandItem[]
  setCommandItems: (items: CommandItem[]) => void
}

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  commandPaletteOpen: false,
  openCommandPalette: () => {},
  closeCommandPalette: () => {},
  commandItems: [],
  setCommandItems: () => {},
})

export function CommandPaletteProvider({ children }: { children: React.ReactNode }) {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandItems, setCommandItems] = useState<CommandItem[]>([])

  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), [])
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), [])

  return (
    <CommandPaletteContext.Provider value={{
      commandPaletteOpen, openCommandPalette, closeCommandPalette, commandItems, setCommandItems,
    }}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

export function useCommandPalette() {
  return useContext(CommandPaletteContext)
}
