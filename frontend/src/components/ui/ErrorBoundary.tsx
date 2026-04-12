import React from 'react'

interface State { hasError: boolean; message: string }

export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center"
          style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
            style={{ background: 'var(--error-bg)', color: 'var(--error)' }}
          >
            !
          </div>
          <p className="text-sm font-medium">页面出现了一个错误</p>
          <p className="text-[12px] max-w-sm" style={{ color: 'var(--text-tertiary)' }}>
            {this.state.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: 'var(--accent)', color: 'var(--accent-fg)' }}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
