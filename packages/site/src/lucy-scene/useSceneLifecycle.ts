import { useEffect, type RefObject } from 'react'
import { SCENE_RUNNING_ATTR } from './scene'

/**
 * One lifecycle observer per scene (#204). Writes `data-scene-running` on the
 * scene root: false while the scene is offscreen, the tab is hidden, or the
 * scene is `held` (the entrance still covers it, so the atmosphere should not
 * spend frames behind the veil). Every engine in the scene — the atmosphere
 * and the Rive character — reads that attribute instead of running its own
 * IntersectionObserver.
 *
 * No React state: the signal is a DOM attribute, so flipping it never
 * re-renders the hero.
 */
export function useSceneLifecycle(rootRef: RefObject<HTMLElement | null>, held = false) {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return undefined
    let visible = true
    const sync = () => root.setAttribute(SCENE_RUNNING_ATTR, String(visible && !document.hidden && !held))

    const io =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(
            (entries) => {
              visible = entries.some((e) => e.isIntersecting)
              sync()
            },
            { threshold: 0.02 },
          )
    io?.observe(root)
    document.addEventListener('visibilitychange', sync)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener('visibilitychange', sync)
      root.removeAttribute(SCENE_RUNNING_ATTR)
    }
  }, [rootRef, held])
}
