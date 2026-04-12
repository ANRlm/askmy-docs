import React from 'react'
import { Copy, CheckCheck, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface State {
  hasError: boolean
  message: string
  errorId: string
  stack: string
  showDetails: boolean
}

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '', errorId: '', stack: '', showDetails: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message,
      errorId: typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID().slice(0, 8).toUpperCase()
        : Math.random().toString(36).slice(2, 10).toUpperCase(),
      stack: error.stack || '',
      showDetails: false,
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  copyError = async () => {
    const { errorId, message, stack } = this.state
    const text = `[Error ID: ${errorId}]\n${message}\n\n${stack}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {}
  }

  reset = () => {
    this.setState({ hasError: false, message: '', errorId: '', stack: '', showDetails: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="eb-title"
        >
          {/* Illustration */}
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
            style={{ background: 'var(--error-bg)' }}
            aria-hidden="true"
          >
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="13" stroke="var(--error)" strokeWidth="1.5" />
              <path d="M14 8v8M14 18v1.5" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>

          <p id="eb-title" className="text-sm font-medium">页面出现了一个错误</p>

          {/* Error ID */}
          <div className="flex items-center gap-2">
            <span
              className="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              #{this.state.errorId}
            </span>
            <button
              onClick={this.copyError}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] interactive"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}
              aria-label="复制错误信息"
            >
              <Copy className="w-3 h-3" />
              <span>复制</span>
            </button>
          </div>

          <p className="text-[12px] max-w-sm" style={{ color: 'var(--text-tertiary)' }}>
            {this.state.message}
          </p>

          {/* Collapsible stack trace */}
          <button
            onClick={() => this.setState((s) => ({ ...s, showDetails: !s.showDetails }))}
            className="flex items-center gap-1 text-[11px] interactive"
            style={{ color: 'var(--text-disabled)' }}
            aria-expanded={this.state.showDetails}
          >
            {this.state.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {this.state.showDetails ? '收起详情' : '查看详情'}
          </button>

          {this.state.showDetails && this.state.stack && (
            <pre
              className="text-left text-[10px] max-w-lg w-full max-h-48 overflow-auto rounded-xl p-3 animate-fade-in"
              style={{
                background: 'var(--code-block-bg)',
                border: '1px solid var(--border)',
                color: 'var(--text-tertiary)',
                fontFamily: "'GeistMono', monospace",
              }}
            >
              {this.state.stack}
            </pre>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={this.reset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重试
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors interactive"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
            >
              刷新页面
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
