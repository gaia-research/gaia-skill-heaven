import { useCallback, useRef, type KeyboardEvent } from 'react'

/**
 * Roving-focus keyboard model for a horizontal tablist (WAI-ARIA tabs,
 * automatic activation): Left/Right move and wrap, Home/End jump. The markup
 * (role="tablist", role="tab", aria-selected, tabindex) stays in the caller.
 */
export function useRovingTabs<T extends string>(keys: readonly T[], active: T, onSelect: (key: T) => void) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({})
  const setRef = useCallback(
    (key: T) => (el: HTMLButtonElement | null) => {
      refs.current[key] = el
    },
    [],
  )
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      const index = keys.indexOf(active)
      let next = index
      if (e.key === 'ArrowRight') next = (index + 1) % keys.length
      else if (e.key === 'ArrowLeft') next = (index - 1 + keys.length) % keys.length
      else if (e.key === 'Home') next = 0
      else if (e.key === 'End') next = keys.length - 1
      else return
      e.preventDefault()
      const key = keys[next]!
      onSelect(key)
      refs.current[key]?.focus()
    },
    [active, keys, onSelect],
  )
  return { setRef, onKeyDown }
}
