import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ToastProvider, useToast } from '../components/ui/Toast'

const TestComponent = () => {
  const { toast } = useToast()
  return (
    <div>
      <button onClick={() => toast('Success message', 'success')}>Show Success</button>
      <button onClick={() => toast('Error message', 'error')}>Show Error</button>
      <button onClick={() => toast('Info message', 'info')}>Show Info</button>
    </div>
  )
}

describe('Toast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('renders without crashing', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )
    expect(screen.getByText('Show Success')).toBeTruthy()
  })

  it('shows toast when toast() is called', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))
    expect(screen.getByText('Success message')).toBeTruthy()
  })

  it('dismisses toast on close button click', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Error'))
    const closeBtn = screen.getByLabelText('关闭提示')
    fireEvent.click(closeBtn)
    expect(screen.queryByText('Error message')).toBeNull()
  })

  it('shows multiple toasts', () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    )

    fireEvent.click(screen.getByText('Show Success'))
    fireEvent.click(screen.getByText('Show Error'))
    fireEvent.click(screen.getByText('Show Info'))

    expect(screen.getByText('Success message')).toBeTruthy()
    expect(screen.getByText('Error message')).toBeTruthy()
    expect(screen.getByText('Info message')).toBeTruthy()
  })
})
