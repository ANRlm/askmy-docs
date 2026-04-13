import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { BookOpen, Eye, EyeOff, ArrowLeft, CheckCircle, XCircle } from 'lucide-react'
import * as api from '../../api'

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify'

export default function AuthPage() {
  const { login, register } = useAuth()

  const getInitialMode = (): { mode: Mode; token: string } => {
    const path = window.location.pathname
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token') || ''
    if (path === '/verify-email') return { mode: 'verify', token }
    if (path === '/reset-password') return { mode: 'reset', token }
    return { mode: 'login', token: '' }
  }

  const initial = getInitialMode()
  const [mode, setMode] = useState<Mode>(initial.mode)
  const [urlToken] = useState(initial.token)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [verifyState, setVerifyState] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (mode !== 'verify') return
    if (!urlToken) {
      setVerifyState('error')
      setError('验证链接无效')
      return
    }
    api.verifyEmail(urlToken)
      .then(() => setVerifyState('success'))
      .catch((e: Error) => {
        setVerifyState('error')
        setError(e.message || '验证失败')
      })
  }, [])

  const switchMode = (m: 'login' | 'register') => {
    setMode(m)
    setError('')
    setSuccess('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (mode === 'register') {
      if (password.length < 8) { setError('密码至少 8 位'); return }
      if (password !== confirmPassword) { setError('两次输入的密码不一致'); return }
    }
    if (mode === 'reset') {
      if (password.length < 8) { setError('密码至少 8 位'); return }
      if (password !== confirmPassword) { setError('两次输入的密码不一致'); return }
    }

    setLoading(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else if (mode === 'register') {
        await register(email, password)
        setSuccess('注册成功！请查收验证邮件以激活账户')
        setEmail('')
        setPassword('')
        setConfirmPassword('')
      } else if (mode === 'forgot') {
        await api.forgotPassword(email)
        setSuccess('如果邮箱已注册，您将收到密码重置邮件')
        setEmail('')
      } else if (mode === 'reset') {
        await api.resetPassword(urlToken, password)
        setSuccess('密码重置成功！请返回登录')
        setPassword('')
        setConfirmPassword('')
      }
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const isTabMode = mode === 'login' || mode === 'register'
  const showBackLink = mode === 'forgot' || mode === 'reset'

  const modeTitle: Record<Mode, string> = {
    login: '',
    register: '',
    forgot: '重置密码',
    reset: '设置新密码',
    verify: '邮箱验证',
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'var(--bg-base)' }}
    >
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(var(--border) 1px, transparent 1px),
            linear-gradient(90deg, var(--border) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 100%)',
          opacity: 0.3,
        }}
      />

      <div className="relative w-full max-w-[360px] animate-slide-up">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--bg-active)', border: '1px solid var(--border-strong)' }}
          >
            <BookOpen className="w-4.5 h-4.5" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <span className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
            AskMyDocs
          </span>
        </div>

        <div
          className="rounded-xl p-7"
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
          }}
        >
          {/* verify email */}
          {mode === 'verify' && (
            <div className="flex flex-col items-center gap-4 py-2">
              {verifyState === 'loading' && (
                <>
                  <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'var(--border-strong)', borderTopColor: 'transparent' }} />
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>正在验证邮箱…</p>
                </>
              )}
              {verifyState === 'success' && (
                <>
                  <CheckCircle className="w-10 h-10" style={{ color: 'var(--success, #22c55e)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>邮箱验证成功！</p>
                  <button
                    onClick={() => { window.history.replaceState({}, '', '/'); setMode('login') }}
                    className="text-xs underline underline-offset-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    前往登录
                  </button>
                </>
              )}
              {verifyState === 'error' && (
                <>
                  <XCircle className="w-10 h-10" style={{ color: 'var(--error, #ef4444)' }} />
                  <p className="text-sm" style={{ color: 'var(--error, #ef4444)' }}>{error || '验证链接无效或已过期'}</p>
                  <button
                    onClick={() => { window.history.replaceState({}, '', '/'); setMode('login') }}
                    className="text-xs underline underline-offset-2"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    返回登录
                  </button>
                </>
              )}
            </div>
          )}

          {mode !== 'verify' && (
            <>
              {/* header */}
              {isTabMode ? (
                <div
                  className="flex rounded-lg p-0.5 mb-6"
                  style={{ background: 'var(--bg-hover)' }}
                >
                  {(['login', 'register'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => switchMode(m)}
                      className="flex-1 py-1.5 rounded-md text-sm font-medium transition-all duration-100"
                      style={
                        mode === m
                          ? { background: 'var(--bg-panel)', color: 'var(--text-primary)' }
                          : { color: 'var(--text-tertiary)' }
                      }
                    >
                      {m === 'login' ? '登录' : '注册'}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-6">
                  {showBackLink && (
                    <button
                      type="button"
                      onClick={() => { setMode('login'); setError(''); setSuccess('') }}
                      className="p-1 rounded interactive-icon"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                  )}
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {modeTitle[mode]}
                  </span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* email field */}
                {(mode === 'login' || mode === 'register' || mode === 'forgot') && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      邮箱
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      required
                      autoComplete="email"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none transition-all duration-100"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                    />
                  </div>
                )}

                {/* password field */}
                {(mode === 'login' || mode === 'register' || mode === 'reset') && (
                  <div>
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      {mode === 'reset' ? '新密码' : '密码'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        className="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none transition-all duration-100 pr-10"
                        style={{
                          background: 'var(--bg-input)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-primary)',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw(!showPw)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 interactive-icon p-0.5 rounded"
                        style={{ color: 'var(--text-tertiary)' }}
                        tabIndex={-1}
                      >
                        {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                {/* confirm password */}
                {(mode === 'register' || mode === 'reset') && (
                  <div className="animate-slide-down">
                    <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                      确认密码
                    </label>
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                      className="w-full px-3.5 py-2.5 rounded-lg text-sm focus:outline-none transition-all duration-100"
                      style={{
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        color: 'var(--text-primary)',
                      }}
                      onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-strong)' }}
                      onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
                    />
                  </div>
                )}

                {/* forgot password link */}
                {mode === 'login' && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); setSuccess('') }}
                      className="text-xs underline-offset-2 hover:underline transition-colors"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      忘记密码？
                    </button>
                  </div>
                )}

                {/* error */}
                {error && (
                  <div
                    className="px-3.5 py-2.5 rounded-lg text-xs animate-fade-in"
                    style={{
                      background: 'var(--error-bg)',
                      color: 'var(--error)',
                      border: '1px solid var(--error)',
                    }}
                  >
                    {error}
                  </div>
                )}

                {/* success */}
                {success && (
                  <div
                    className="px-3.5 py-2.5 rounded-lg text-xs animate-fade-in"
                    style={{
                      background: 'color-mix(in srgb, var(--success, #22c55e) 10%, transparent)',
                      color: 'var(--success, #22c55e)',
                      border: '1px solid color-mix(in srgb, var(--success, #22c55e) 40%, transparent)',
                    }}
                  >
                    {success}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all duration-100 mt-1 disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
                  style={{
                    background: 'var(--text-primary)',
                    color: 'var(--bg-base)',
                  }}
                >
                  {loading
                    ? '请稍候...'
                    : mode === 'login'
                      ? '登录账户'
                      : mode === 'register'
                        ? '创建账户'
                        : mode === 'forgot'
                          ? '发送重置邮件'
                          : '确认重置密码'
                  }
                </button>
              </form>
            </>
          )}
        </div>

        {isTabMode && (
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
        )}
      </div>
    </div>
  )
}
