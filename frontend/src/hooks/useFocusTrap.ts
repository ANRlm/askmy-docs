import { useEffect, useRef } from 'react'

/**
 * Focus trap hook — traps keyboard focus within a container.
 * On mount: moves focus to the first focusable element.
 * On unmount: returns focus to the trigger element (if provided).
 */
export function useFocusTrap<T extends HTMLElement>(
  isActive: boolean,
  triggerRef?: React.RefObject<HTMLElement | null>
) {
  const containerRef = useRef<T>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isActive) return

    // Save current focus
    previousFocusRef.current = document.activeElement as HTMLElement

    // Focus first focusable element in the container
    const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    if (focusable?.length) {
      focusable[0].focus()
    } else {
      containerRef.current?.focus()
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !containerRef.current) return
      const focusable = containerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus
      if (triggerRef?.current) {
        triggerRef.current.focus()
      } else if (previousFocusRef.current) {
        previousFocusRef.current.focus()
      }
    }
  }, [isActive, triggerRef])

  return containerRef
}
