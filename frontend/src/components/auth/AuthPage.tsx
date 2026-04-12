import React, { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { BookOpen, Eye, EyeOff } from 'lucide-react'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password !== confirmPassword) {
      setError('两次输入的密码不一致')
      return
    }
    if (mode === 'register' && password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setLoading(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password)
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-3.5 py-2.5 rounded-xl text-sm focus:outline-none transition-all duration-150 ' +
    'placeholder:text-[color:var(--text-disabled)] ' +
    'text-[color:var(--text-primary)] ' +
    'bg-[var(--bg-input)] border border-[var(--border)] ' +
    'focus:border-[var(--border-strong)] focus:bg-[var(--bg-hover)]'

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div className="w-full max-w-[360px] animate-slide-up">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm"
            style={{ background: 'var(--accent)' }}
          >
            <BookOpen className="w-4.5 h-4.5" style={{ color: 'var(--accent-fg)' }} />
          </div>
          <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            AskMyDocs
          </span>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-7 shadow-md"
          style={{
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          {/* Tab switcher */}
          <div
            className="flex rounded-xl p-0.5 mb-6"
            style={{ background: 'var(--bg-hover)' }}
          >
            {(['login', 'register'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className="flex-1 py-1.5 rounded-lg text-sm font-medium transition-all duration-150"
                style={
                  mode === m
                    ? {
                        background: 'var(--bg-panel)',
                        color: 'var(--text-primary)',
                        boxShadow: 'var(--shadow-sm)',
                      }
                    : { color: 'var(--text-tertiary)' }
                }
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Email */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                邮箱
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
                className={inputClass}
              />
            </div>

            {/* Password */}
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                密码
              </label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className={inputClass + ' pr-10'}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: 'var(--text-tertiary)' }}
                  tabIndex={-1}
                >
                  {showPw
                    ? <EyeOff className="w-4 h-4" />
                    : <Eye className="w-4 h-4" />
                  }
                </button>
              </div>
            </div>

            {/* Confirm password */}
            {mode === 'register' && (
              <div className="animate-slide-down">
                <label
                  className="block text-xs font-medium mb-1.5"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  确认密码
                </label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div
                className="px-3.5 py-2.5 rounded-xl text-xs animate-fade-in"
                style={{
                  background: 'var(--error-bg)',
                  color: 'var(--error)',
                  border: '1px solid var(--error-bg)',
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 mt-1 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
              style={{
                background: 'var(--accent)',
                color: 'var(--accent-fg)',
              }}
            >
              {loading
                ? '请稍候...'
                : mode === 'login'
                  ? '登录账户'
                  : '创建账户'
              }
            </button>
          </form>
        </div>

        <p className="text-center mt-4 text-xs" style={{ color: 'var(--text-disabled)' }}>
          {mode === 'login' ? '还没有账户？' : '已有账户？'}
          <button
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
            className="ml-1 font-medium underline underline-offset-2 transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            {mode === 'login' ? '立即注册' : '去登录'}
          </button>
        </p>
      </div>
    </div>
  )
}
