import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import * as api from '../api'

interface AuthContextType {
  token: string | null
  user: { id: number; email: string } | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<AuthContextType['user']>(null)

  useEffect(() => {
    if (token) {
      api.getMe().then(setUser).catch(() => {
        setToken(null)
        localStorage.removeItem('token')
      })
    }
  }, [token])

  const login = async (email: string, password: string) => {
    const data = await api.login(email, password)
    localStorage.setItem('token', data.access_token)
    setToken(data.access_token)
  }

  const register = async (email: string, password: string) => {
    await api.register(email, password)
    await login(email, password)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ token, user, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
