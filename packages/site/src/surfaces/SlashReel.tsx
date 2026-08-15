/**
 * SlashReel — the clean-slate loop.
 *
 * A native harness ships with a stack of bundled skills you never asked for;
 * every one is standing context the model reads before your first token. This
 * little reel shows Skill Zero *slashing them out* — the list empties top-down
 * and the standing token count falls from `native` to the measured product
 * floor, landing on a clean slate where `/summon` pulls back only what a task
 * needs. Numbers are the real DOSES figures so it agrees with the panel beside
 * it. Honours prefers-reduced-motion by rendering the settled clean state.
 */

import { useEffect, useRef, useState } from 'react'
import { DOSES } from '../product'

const BUNDLED = [
  'pdf-tools',
  'jira-sync',
  'k8s-deploy',
  'figma-import',
  'stripe-billing',
  'sql-migrate',
] as const

const NATIVE = DOSES.native
const FLOOR = DOSES.productFloor
const TOTAL = BUNDLED.length

const REDUCED =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const fmt = (n: number) => n.toLocaleString('en-US')

export function SlashReel() {
  const [cut, setCut] = useState(REDUCED ? TOTAL : 0)
  const [clean, setClean] = useState(REDUCED)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    if (REDUCED) return
    let n = 0
    let mode: 'cutting' | 'holding' = 'cutting'
    const tick = () => {
      if (mode === 'cutting') {
        n += 1
        setCut(n)
        if (n >= TOTAL) {
          setClean(true)
          mode = 'holding'
          timer.current = window.setTimeout(tick, 1600)
          return
        }
        timer.current = window.setTimeout(tick, 280)
      } else {
        setClean(false)
        setCut(0)
        n = 0
        mode = 'cutting'
        timer.current = window.setTimeout(tick, 640)
      }
    }
    timer.current = window.setTimeout(tick, 800)
    return () => window.clearTimeout(timer.current)
  }, [])

  const tokens = clean ? FLOOR : Math.round(NATIVE - ((NATIVE - FLOOR) * cut) / TOTAL)

  return (
    <div
      className="lp-reel"
      role="img"
      aria-label={`Skill Zero slashes bundled skills out of context, cutting the standing cost from ${fmt(
        NATIVE,
      )} to ${fmt(FLOOR)} tokens — a clean slate you summon into on demand.`}
    >
      <div className="lp-reel__head">
        <span className="lp-reel__cmd">
          $ skill-zero <b>--slash</b>
        </span>
        <span className="lp-reel__count" aria-hidden="true">
          <span className={clean ? 'lp-reel__tok is-clean' : 'lp-reel__tok'}>{fmt(tokens)}</span>
          <span className="lp-reel__unit">tok standing</span>
        </span>
      </div>

      <div className="lp-reel__body" aria-hidden="true">
        <ul className="lp-reel__list">
          {BUNDLED.map((name, i) => (
            <li key={name} className={i < cut ? 'lp-reel__row is-cut' : 'lp-reel__row'}>
              <span className="lp-reel__slash">/</span>
              <span className="lp-reel__name">{name}</span>
              <span className="lp-reel__meta">bundled</span>
            </li>
          ))}
        </ul>
        <div className={clean ? 'lp-reel__clean is-on' : 'lp-reel__clean'}>
          <span className="lp-reel__caret">▍</span>
          <span>
            clean slate — <code>/summon</code> only what the task needs
          </span>
        </div>
      </div>
    </div>
  )
}
