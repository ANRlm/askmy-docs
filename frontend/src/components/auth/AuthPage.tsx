import React, { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { BookOpen } from 'lucide-react'

export default function AuthPage() {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
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
      if (mode === 'login') {
        await login(email, password)
      } else {
        await register(email, password)
      }
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
      <div className="w-full max-w-sm px-4">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <BookOpen className="w-4.5 h-4.5 text-black" />
          </div>
          <span className="text-xl font-semibold text-white">AskMyDocs</span>
        </div>

        <div className="bg-[#161616] border border-white/[0.08] rounded-2xl p-7">
          <h1 className="text-base font-medium text-white mb-1">
            {mode === 'login' ? '登录账户' : '创建账户'}
          </h1>
          <p className="text-xs text-white/35 mb-6">
            {mode === 'login' ? '欢迎回来' : '开始使用 AskMyDocs'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">邮箱</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
              />
            </div>

            {mode === 'register' && (
              <div className="animate-fade-in">
                <label className="block text-xs text-white/50 mb-1.5">确认密码</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full px-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/[0.08] text-white text-sm placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>
            )}

            {error && (
              <div className="px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/15 text-red-400 text-xs">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors mt-1"
            >
              {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册账号'}
            </button>
          </form>

          <div className="mt-5 pt-5 border-t border-white/[0.06] text-center">
            <span className="text-xs text-white/30">
              {mode === 'login' ? '还没有账户？' : '已有账户？'}
            </span>
            <button
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="text-xs text-white/60 hover:text-white ml-1 transition-colors"
            >
              {mode === 'login' ? '注册' : '登录'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
