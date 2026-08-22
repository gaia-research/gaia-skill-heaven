/**
 * Landing — the document page.
 *
 * The hero is the poster; this is the page a developer who has already
 * decided actually reads. It reproduces the approved landing comp
 * (wireframe register: numbered sections, hairlines at 0 radius, dashed
 * annotation strips, one looping terminal with a 46ms impact frame) and
 * carries the current product truth: one mechanic (`summon`), four
 * surfaces, one discrete ladder, five real doors.
 *
 * Every product string is read from `../product`. Nothing here is invented:
 * no pricing, no logos, no testimonials, no counts.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import {
  DIRECTION_WORD,
  DOORS,
  DOSES,
  HOUSES,
  INSTALL,
  LADDER_MEASURE,
  LADDER_WIP,
  MECHANIC,
  RUNGS,
  RUNG_BAND,
  SESSION_ROWS,
  SITE,
  STAMP_ROUTING_NOTE,
  SURFACES,
  surfaceById,
  PLATFORM_COMMANDS,
  type Door,
  type Platform,
  type RungId,
  type SurfaceId,
} from '../product'
import '../styles/system.css'
import './landing.css'
import { SlashReel } from './SlashReel'
import { HarnessMark } from '../harnessMarks'
import { PlatformToggle } from '../components/PlatformToggle'

/* -- the commission: real art, no placeholder slots left except the logo -- */
import lucyZero from '../assets/lucy/v5/delivery/lucy-zero.webp'
import lucyHeaven from '../assets/lucy/v5/delivery/lucy-heaven.webp'
import lucyHell from '../assets/lucy/v5/delivery/lucy-hell.webp'
import lucyUltra from '../assets/lucy/v5/delivery/lucy-ultra.webp'
import bgZero from '../assets/lucy/backgrounds/lucy-bg-zero-desktop.webp'
import bgHeaven from '../assets/lucy/backgrounds/lucy-bg-heaven-desktop.webp'
import bgHell from '../assets/lucy/backgrounds/lucy-bg-hell-desktop.webp'
import bgUltra from '../assets/lucy/backgrounds/lucy-bg-ultra-desktop.webp'
import iconZero from '../assets/lucy/identity/lucy-state-icon-zero.svg'
import iconHeaven from '../assets/lucy/identity/lucy-state-icon-heaven.svg'
import iconHell from '../assets/lucy/identity/lucy-state-icon-hell.svg'
import iconUltra from '../assets/lucy/identity/lucy-state-icon-ultra.svg'
import brandLogo from '../assets/brand/skill-heaven-logo.png'

const SURFACE_ICON: Record<SurfaceId, string> = {
  zero: iconZero,
  heaven: iconHeaven,
  hell: iconHell,
  ultra: iconUltra,
}

const SESSION_DIR = '/tmp/skill-zero-a91f7c'
const fmt = (n: number) => n.toLocaleString('en-US')

/** Install truth is owned by product.ts; read the real fields directly. */
const AGENT_PLUGIN_COMMAND = INSTALL.agentPlugin.command
const AGENT_PLUGIN_NOTE = INSTALL.agentPlugin.note
const CLAUDE_COMPATIBILITY = INSTALL.claudeMarketplace.commands
const CLAUDE_COMPATIBILITY_NOTE = INSTALL.claudeMarketplace.note

/** Per-door note. Derived from status only — no per-harness claim is invented. */
function doorNote(door: Door): string {
  return door.status === 'flagship'
    ? `The flagship door. The measured floor on this page was recorded on ${door.harness}.`
    : `Zero skills. ${MECHANIC.floor} to summon any skill, including your own.`
}

/* -------------------------------------------------------------------------
   §02 — the simulated session. Numbers are interpolated from product truth,
   never typed in by hand.
   ------------------------------------------------------------------------- */

type SamplerMode = 'all' | 'summon' | 'heaven' | 'hell' | 'ultra' | 'zero'

const BORROWED = SESSION_ROWS[4] // obra/systematic-debugging, skill-tree origin
const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface ClaudeTurn {
  id: string
  cmd: string
  bulletTone?: 'coral' | 'heaven' | 'hell' | 'ultra'
  verb: string
  palette?: 'natural' | 'hell'
  shear?: boolean
  automated?: boolean
  title: ReactNode
  lines: ReactNode[]
  readyTiming: string
}

interface TurnHistoryState {
  turnIdx: number
  showTitle: boolean
  linesCount: number
}

function SummonedSkillPill({
  name,
  tag,
  tokens,
  tone,
}: {
  name: string
  tag: string
  tokens: string
  tone: 'cyan' | 'violet' | 'amber' | 'gold'
}) {
  return (
    <div className={`lp-cc-skill-pill lp-cc-skill-pill--${tone}`}>
      <span className="lp-cc-skill-dot" aria-hidden="true" />
      <span className="lp-cc-skill-name">{name}</span>
      <span className="lp-cc-skill-tag">{tag}</span>
      <span className="lp-cc-skill-tok">{tokens}</span>
      <span className="lp-cc-skill-badge">BORROWED</span>
    </div>
  )
}

function ClaudeTerminalLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 180 84"
      fill="currentColor"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M30,0 H150 V16 H30 Z M30,16 H50 V32 H30 Z M60,16 H120 V32 H60 Z M130,16 H150 V32 H130 Z M10,32 H170 V48 H10 Z M30,48 H150 V64 H30 Z M40,64 H50 V80 H40 Z M60,64 H70 V80 H60 Z M110,64 H120 V80 H110 Z M130,64 H140 V80 H130 Z" />
    </svg>
  )
}

const CLAUDE_TURNS: ClaudeTurn[] = [
  {
    id: 'summon',
    cmd: `${MECHANIC.floor} obra/systematic-debugging`,
    bulletTone: 'coral',
    verb: 'Cogitating…',
    title: (
      <>
        Summoning <span className="cc-file">{BORROWED.id}</span> into context…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="debug"
        name="obra/systematic-debugging"
        tag="root-cause"
        tokens={`+${fmt(BORROWED.tokens)} tok`}
        tone="cyan"
      />,
      '· source: gaia-skill-tree · 1 skill mounted for this session only',
      '· 0 diffs written to working tree · clean slate',
    ],
    readyTiming: '340ms',
  },
  {
    id: 'heaven-1',
    cmd: '/skill-heaven brainstorm with me a design idea',
    bulletTone: 'heaven',
    verb: 'Ruminating…',
    title: (
      <>
        <span className="cc-cyan">Skill Heaven (converge)</span> auto-summoned pbakaus/impeccable…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="impeccable"
        name="pbakaus/impeccable"
        tag="design-systems"
        tokens="+1,420 tok"
        tone="violet"
      />,
      <div className="lp-cc-block lp-cc-block--heaven" key="impeccable-v">
        <div className="lp-cc-subhead">
          <span className="cc-cyan">◆ [pbakaus/impeccable]</span> 3 visual directions drafted for "SaaS Landing Page":
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Variation A (Linear-dark): High-density hairlines, mono tags, dark void</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Variation B (Editorial-warm): Washed charcoal, Anton headers, warm bone</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Variation C (Kinetic-prism): Refracted spectrum accents, interactive canvas</div>
      </div>,
    ],
    readyTiming: '412ms',
  },
  {
    id: 'heaven-2',
    cmd: "Let's go with Variation B (Editorial-warm)",
    bulletTone: 'heaven',
    verb: 'Deliberating…',
    title: (
      <>
        <span className="cc-cyan">Skill Heaven</span> auto-summoned mattpocock/grill-me to refine direction…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="grill"
        name="mattpocock/grill-me"
        tag="critique"
        tokens="+860 tok"
        tone="violet"
      />,
      <div className="lp-cc-block lp-cc-block--heaven" key="grill-q">
        <div className="lp-cc-subhead">
          <span className="cc-cyan">◆ [mattpocock/grill-me]</span> Grilling session — 2 architectural questions:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;1. What is the core conversion target? (self-serve developer vs enterprise demo)</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;2. Should the hero feature an interactive code terminal or a visual canvas?</div>
      </div>,
    ],
    readyTiming: '380ms',
  },
  {
    id: 'heaven-3',
    cmd: '1. Self-serve developer signups, and 2. An interactive Claude Code terminal',
    bulletTone: 'heaven',
    verb: 'Crunching…',
    title: (
      <>
        <span className="cc-cyan">Skill Heaven</span> synthesized SaaS landing page components…
      </>
    ),
    lines: [
      '· Wrote src/components/LandingHero.tsx (Editorial-warm layout, Anton display)',
      '· Wrote src/components/ClaudeTerminal.tsx (interactive TUI, sticky tail scroll)',
      '· 0 diffs outside disposable session · standing dose: 20,176 tok',
    ],
    readyTiming: '520ms',
  },
  {
    id: 'hell',
    cmd: '/skill-hell explore the codebase and autofix security issues',
    bulletTone: 'hell',
    verb: 'Prestidigitating…',
    title: (
      <>
        <span className="cc-amber">Skill Hell (explore)</span> spawned autonomous multi-agent swarm…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="cso"
        name="garrytan/cso"
        tag="security-audit"
        tokens="+2,100 tok"
        tone="amber"
      />,
      <SummonedSkillPill
        key="debug-hell"
        name="obra/systematic-debugging"
        tag="deep-diagnostics"
        tokens="+515 tok"
        tone="amber"
      />,
      <div className="lp-cc-block lp-cc-block--hell" key="cso-detect">
        <div className="lp-cc-subhead">
          <span className="cc-amber">◈ [garrytan/cso]</span> Scanning AST & dependency tree for attack vectors…
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Flagged high-severity CVE: prototype pollution in session claim parser (src/auth/jwt.ts:42)</div>
      </div>,
      <div className="lp-cc-block lp-cc-block--hell" key="debug-trace">
        <div className="lp-cc-subhead">
          <span className="cc-amber">◈ [obra/systematic-debugging]</span> Swarm delegated: isolated reproduction & drafted patch
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Created reproduction in test/auth-security.test.ts (reproduced: RED)</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Applied fix: sanitized dictionary with Object.create(null) + frozen prototype</div>
      </div>,
      <div className="lp-cc-block lp-cc-block--hell" key="cso-verify">
        <div className="lp-cc-subhead">
          <span className="cc-amber">◈ [garrytan/cso]</span> Autonomous verification & Pull Request:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Security audit PASS: 0 CVEs remaining · all exploit vectors neutralized</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Regression tests: 38/38 unit & security tests green (GREEN)</div>
        <div className="lp-cc-dim">
          &nbsp;&nbsp;<span className="cc-green">✓</span> Git: Committed to branch <span className="cc-file">fix/cve-session-prototype-pollution</span>
        </div>
        <div className="lp-cc-dim">
          &nbsp;&nbsp;<span className="cc-green">✓</span> GitHub: Opened Draft PR #142 "fix(auth): sanitize JWT session claim prototype injection"
        </div>
      </div>,
    ],
    readyTiming: '680ms',
  },
  {
    id: 'ultra-1',
    cmd: '/skill-ultra redesign analytics dashboard and harden streaming pipeline',
    bulletTone: 'ultra',
    verb: 'Orchestrating…',
    palette: 'natural',
    title: (
      <>
        <span className="cc-gold">Skill Ultra (the crown)</span> decomposed task into 2 capability gaps…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="impeccable-ultra"
        name="pbakaus/impeccable"
        tag="design-systems"
        tokens="+1,420 tok"
        tone="gold"
      />,
      <div className="lp-cc-block lp-cc-block--ultra" key="ultra-decomp">
        <div className="lp-cc-subhead">
          <span className="cc-gold">♛ [ultra controller]</span> Dynamic Entropy Planner:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Gap 1 [UI Architecture & Data Density] → Dialing <b className="cc-cyan">HEAVEN (Converge · Human-in-the-Loop)</b></div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Gap 2 [Stream Hardening & Load Test] → Dialing <b className="cc-amber">HELL (Explore · Autonomous Swarm)</b></div>
      </div>,
      <div className="lp-cc-block lp-cc-block--heaven" key="ultra-gap1">
        <div className="lp-cc-subhead">
          <span className="cc-cyan">◆ [pbakaus/impeccable]</span> Gap 1 — 2 UI architecture directions:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Strategy A (Live Telemetry HUD): 60fps canvas sparklines + zero-latency buffer</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Strategy B (Executive KPI Canvas): High-level aggregates + accordion drawers</div>
      </div>,
    ],
    readyTiming: '430ms',
  },
  {
    id: 'ultra-2',
    cmd: 'Strategy A (Live Telemetry HUD) with 60fps sparklines',
    bulletTone: 'heaven',
    verb: 'Converging…',
    palette: 'natural',
    title: (
      <>
        <span className="cc-cyan">Skill Heaven</span> auto-summoned mattpocock/grill-me to lock architecture…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="grill-ultra"
        name="mattpocock/grill-me"
        tag="critique"
        tokens="+860 tok"
        tone="violet"
      />,
      <div className="lp-cc-block lp-cc-block--heaven" key="ultra-lock">
        <div className="lp-cc-subhead">
          <span className="cc-cyan">◆ [mattpocock/grill-me]</span> Architecture locked with human feedback:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Strategy A selected: High-density 60fps canvas telemetry sparklines</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Specified zero-alloc circular buffer interface for live event streams</div>
      </div>,
      <div className="lp-cc-block lp-cc-block--ultra" key="ultra-handoff">
        <div className="lp-cc-subhead">
          <span className="cc-gold">♛ [ultra controller]</span> Gap 1 resolved in Heaven → Escalating Gap 2 to Skill Hell…
        </div>
      </div>,
    ],
    readyTiming: '480ms',
  },
  {
    id: 'ultra-3',
    cmd: '[swarm] /skill-hell explore streaming pipeline, fix memory leaks & chaos test',
    bulletTone: 'hell',
    verb: 'Prestidigitating swarm…',
    palette: 'hell',
    shear: true,
    automated: true,
    title: (
      <>
        <span className="cc-amber">Skill Hell (explore)</span> spawned autonomous 3-agent swarm…
      </>
    ),
    lines: [
      <SummonedSkillPill
        key="perf-ultra"
        name="addy-osmani/performance-optimization"
        tag="perf-tuning"
        tokens="+2,640 tok"
        tone="amber"
      />,
      <SummonedSkillPill
        key="cso-ultra"
        name="garrytan/cso"
        tag="chaos-audit"
        tokens="+2,100 tok"
        tone="amber"
      />,
      <SummonedSkillPill
        key="debug-ultra"
        name="obra/systematic-debugging"
        tag="deep-diagnostics"
        tokens="+515 tok"
        tone="amber"
      />,
      <div className="lp-cc-block lp-cc-block--hell" key="ultra-swarm-trace">
        <div className="lp-cc-subhead">
          <span className="cc-amber">◈ [addy-osmani/perf]</span> Benchmarking WebSocket pipeline under 100k msg/sec load…
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Identified memory leak in buffer allocation (src/stream/ws-buffer.ts:88)</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Replaced with zero-alloc circular ring buffer (src/stream/circular-buffer.ts)</div>
      </div>,
      <div className="lp-cc-block lp-cc-block--hell" key="ultra-chaos">
        <div className="lp-cc-subhead">
          <span className="cc-amber">◈ [garrytan/cso]</span> Chaos testing & thread safety validation:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Injected 50,000 evt/sec synthetic bursts: 0 dropped frames · heap flat at 18MB</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Regression sweep: 42/42 pipeline & benchmark tests green (GREEN)</div>
      </div>,
    ],
    readyTiming: '680ms',
  },
  {
    id: 'ultra-4',
    cmd: '[ultra] synthesize Heaven + Hell outputs & open Pull Request',
    bulletTone: 'ultra',
    verb: 'Synthesizing…',
    palette: 'natural',
    automated: true,
    title: (
      <>
        <span className="cc-gold">Skill Ultra</span> merged dual orchestration (Heaven + Hell) into PR…
      </>
    ),
    lines: [
      <div className="lp-cc-block lp-cc-block--ultra" key="ultra-summary">
        <div className="lp-cc-subhead">
          <span className="cc-gold">♛ [ultra controller]</span> Unified dual-track synthesis:
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Wrote src/components/AnalyticsHUD.tsx (Strategy A Telemetry HUD, 60fps canvas)</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Wrote src/stream/circular-buffer.ts (zero-alloc ring buffer)</div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Verified 0 dropped frames under 50k evt/sec load</div>
        <div className="lp-cc-dim">
          &nbsp;&nbsp;<span className="cc-green">✓</span> Git: Committed branch <span className="cc-file">feat/analytics-hud-stream-hardening</span>
        </div>
        <div className="lp-cc-dim">
          &nbsp;&nbsp;<span className="cc-green">✓</span> GitHub: Opened Draft PR #184 "feat(analytics): 60fps HUD + zero-alloc stream pipeline"
        </div>
        <div className="lp-cc-dim">&nbsp;&nbsp;· Standing dose returned to clean product floor · 0 uncommitted diffs</div>
      </div>,
    ],
    readyTiming: '540ms',
  },
  {
    id: 'zero',
    cmd: '/skill-zero',
    bulletTone: 'coral',
    verb: 'Recombobulating…',
    palette: 'natural',
    title: (
      <>
        <span className="cc-cyan">Skill Zero</span> automatic skill summons paused
      </>
    ),
    lines: [
      '· automatic skill summons: PAUSED · 0 skills auto-borrowed',
      `· standing dose: ${fmt(DOSES.productFloor)} tok (product floor)`,
      '· base model active · manual /summon available on demand',
    ],
    readyTiming: '240ms',
  },
]

const SAMPLER_SEQUENCES: Record<SamplerMode, number[]> = {
  heaven: [1, 2, 3],
  hell: [4],
  ultra: [5, 6, 7, 8],
  all: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  summon: [0],
  zero: [9],
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/* =========================================================================
   the page
   ========================================================================= */

/* =========================================================================
   Info Tooltip (Clickable & Accessible Popover)
   ========================================================================= */

interface InfoTooltipProps {
  content: ReactNode
  label?: string
  align?: 'left' | 'right' | 'center'
  variant?: 'icon' | 'badge'
  badgeText?: string
  className?: string
}

function InfoTooltip({
  content,
  label = 'More information',
  align = 'left',
  variant = 'icon',
  badgeText,
  className = '',
}: InfoTooltipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const toggle = useCallback((e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpen((prev) => !prev)
  }, [])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: globalThis.MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div
      className={`lp-tooltip-wrap lp-tooltip--${align}${open ? ' is-open' : ''} ${className}`.trim()}
      ref={ref}
    >
      <button
        type="button"
        className={variant === 'badge' ? 'lp-tooltip-badge' : 'lp-tooltip-btn'}
        onClick={toggle}
        aria-expanded={open}
        aria-label={label}
      >
        {variant === 'badge' ? (
          <>
            <span>{badgeText}</span>
            <span className="lp-tooltip-mark" aria-hidden="true">ⓘ</span>
          </>
        ) : (
          <span className="lp-tooltip-mark" aria-hidden="true">ⓘ</span>
        )}
      </button>

      {open && (
        <div
          className="lp-tooltip-popover"
          role="tooltip"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lp-tooltip-body">{content}</div>
          <button
            type="button"
            className="lp-tooltip-close"
            onClick={() => setOpen(false)}
            aria-label="Close tooltip"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}

export default function Landing() {
  /* ---- §01 doors + install ---- */
  const [pickedId, setPickedId] = useState(DOORS[0].id)
  const picked = DOORS.find((d) => d.id === pickedId) ?? DOORS[0]
  const [pluginMode, setPluginMode] = useState<'agent-plugin' | 'claude'>('agent-plugin')
  const [platform, setPlatform] = useState<Platform>('posix')
  const [copied, setCopied] = useState('')
  const copyTimer = useRef<number | undefined>(undefined)

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(''), 1600)
  }, [])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  /* ---- §02 terminal ---- */
  const [samplerMode, setSamplerMode] = useState<SamplerMode>('heaven')
  const [history, setHistory] = useState<TurnHistoryState[]>([])
  const [currentInput, setCurrentInput] = useState<string>('')
  const [activeVerb, setActiveVerb] = useState<string>('')
  const [brailleIdx, setBrailleIdx] = useState(0)
  const [hell, setHell] = useState(false)
  const [shear, setShear] = useState(false)
  const [userScrolledUp, setUserScrolledUp] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const animTimerRef = useRef<number | undefined>(undefined)
  const shearTimerRef = useRef<number | undefined>(undefined)

  const clearTimers = useCallback(() => {
    if (animTimerRef.current) window.clearTimeout(animTimerRef.current)
    if (shearTimerRef.current) window.clearTimeout(shearTimerRef.current)
  }, [])

  // Detect user manual scroll — stick to tail only if user hasn't scrolled up
  const handleBodyScroll = useCallback(() => {
    if (!bodyRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = bodyRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40
    setUserScrolledUp(!isAtBottom)
  }, [])

  // Braille spinner animation loop — spins only while activeVerb is working, pauses when Ready
  useEffect(() => {
    if (!activeVerb) return
    const brailleTimer = window.setInterval(() => {
      setBrailleIdx((prev) => (prev + 1) % BRAILLE.length)
    }, 80)
    return () => window.clearInterval(brailleTimer)
  }, [activeVerb])

  const typeAndSubmitCommand = useCallback(
    (turnIdx: number, onDone: () => void) => {
      const turn = CLAUDE_TURNS[turnIdx]
      const fullCmd = turn.cmd
      let charIdx = 0
      setCurrentInput('')

      const isHellPalette = turn.palette === 'hell' || turn.id.startsWith('hell')

      const executeTurn = () => {
        if (isHellPalette) {
          setHell(true)
        } else {
          setHell(false)
        }

        if (turn.shear || turn.id === 'hell-1') {
          setShear(true)
          shearTimerRef.current = window.setTimeout(() => setShear(false), 340)
        }

        // Move command from bottom prompt into top conversation history
        setCurrentInput('')
        setHistory((prev) => [
          ...prev,
          { turnIdx, showTitle: false, linesCount: 0 },
        ])
        // Set ONE single verb for the entire task
        setActiveVerb(turn.verb)

        // Step 1: Deliberate thinking/tool dispatch delay (showing braille spinner)
        animTimerRef.current = window.setTimeout(() => {
          setHistory((prev) =>
            prev.map((item, idx) =>
              idx === prev.length - 1 ? { ...item, showTitle: true } : item,
            ),
          )

          // Step 2: Stream lines one by one with a readable, natural cadence
          let lineIdx = 0
          const revealNextLine = () => {
            if (lineIdx < turn.lines.length) {
              lineIdx++
              setHistory((prev) =>
                prev.map((item, idx) =>
                  idx === prev.length - 1
                    ? { ...item, linesCount: lineIdx }
                    : item,
                ),
              )
              if (lineIdx < turn.lines.length) {
                animTimerRef.current = window.setTimeout(
                  revealNextLine,
                  turn.automated ? 580 : 720,
                )
              } else {
                // Finished all lines in this turn -> Ready state (pause spinner animation)
                setActiveVerb('')
                const isDense = turn.lines.length > 2 || isHellPalette || turn.id.startsWith('ultra')
                // Natural pause after turn completes to give reader time to read the result
                animTimerRef.current = window.setTimeout(
                  onDone,
                  isDense ? 3600 : 2800,
                )
              }
            }
          }

          animTimerRef.current = window.setTimeout(revealNextLine, 600)
        }, turn.automated ? 680 : 950)
      }

      if (turn.automated) {
        // Automated multi-agent swarm action: dispatches without human typing delay
        animTimerRef.current = window.setTimeout(executeTurn, 480)
      } else {
        // Human typing simulation
        const typeNextChar = () => {
          if (charIdx < fullCmd.length) {
            const char = fullCmd[charIdx]
            charIdx++
            setCurrentInput(fullCmd.slice(0, charIdx))
            // Natural human cadence: tiny hesitation on space, slash, quotes or punctuation
            const isPunct = char === ' ' || char === '/' || char === '-' || char === '\'' || char === '"' || char === '.'
            const charDelay = isPunct ? 68 : 34 + (charIdx % 4) * 5
            animTimerRef.current = window.setTimeout(typeNextChar, charDelay)
          } else {
            // Pause naturally at end of command before "pressing Enter" to let user read what was typed
            animTimerRef.current = window.setTimeout(executeTurn, 550)
          }
        }

        // Initial breath before typing starts
        animTimerRef.current = window.setTimeout(typeNextChar, 500)
      }
    },
    [],
  )

  const runSequence = useCallback(
    (indices: number[]) => {
      clearTimers()
      setHell(false)
      setShear(false)
      setHistory([])
      setCurrentInput('')
      setActiveVerb('')
      setUserScrolledUp(false)

      if (prefersReducedMotion()) {
        setHistory(
          indices.map((idx) => ({
            turnIdx: idx,
            showTitle: true,
            linesCount: CLAUDE_TURNS[idx].lines.length,
          })),
        )
        return
      }

      let seqPos = 0
      const nextStep = () => {
        if (seqPos >= indices.length) {
          animTimerRef.current = window.setTimeout(() => {
            runSequence(indices)
          }, 6000)
          return
        }
        const turnIdx = indices[seqPos]
        seqPos++
        typeAndSubmitCommand(turnIdx, nextStep)
      }

      animTimerRef.current = window.setTimeout(nextStep, 480)
    },
    [clearTimers, typeAndSubmitCommand],
  )

  const selectSampler = useCallback(
    (mode: SamplerMode) => {
      clearTimers()
      setSamplerMode(mode)
      const seq = SAMPLER_SEQUENCES[mode]
      runSequence(seq)
    },
    [clearTimers, runSequence],
  )

  const replay = useCallback(() => {
    selectSampler(samplerMode)
  }, [selectSampler, samplerMode])

  const location = useLocation()
  const initialTabHandledRef = useRef<string | null>(null)

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const tabParam = (location.state as { tab?: string } | null)?.tab ?? searchParams.get('tab')
    const validModes: SamplerMode[] = ['all', 'summon', 'heaven', 'hell', 'ultra', 'zero']
    const mode = tabParam && validModes.includes(tabParam as SamplerMode) ? (tabParam as SamplerMode) : 'heaven'

    const key = tabParam ?? '__default__'
    if (initialTabHandledRef.current !== key) {
      initialTabHandledRef.current = key
      selectSampler(mode)
    }
  }, [location.search, location.state, selectSampler])

  useEffect(() => {
    if (bodyRef.current && !userScrolledUp) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [history, activeVerb, currentInput, userScrolledUp])

  /* ---- §03 the session story ---- */
  const [mounted, setMounted] = useState<string[]>(
    SESSION_ROWS.filter((r) => r.mounted).map((r) => r.id),
  )
  const isOn = useCallback((id: string) => mounted.includes(id), [mounted])
  const toggleRow = useCallback((id: string) => {
    setMounted((m) => (m.includes(id) ? m.filter((x) => x !== id) : m.concat(id)))
  }, [])

  const { nAdded, nDropped, standing, verdict } = useMemo(() => {
    const added = SESSION_ROWS.filter((r) => r.origin === 'skill-tree' && mounted.includes(r.id)).length
    const dropped = SESSION_ROWS.filter((r) => r.origin === 'repo' && !mounted.includes(r.id)).length
    const tokens = SESSION_ROWS.reduce((n, r) => n + (mounted.includes(r.id) ? r.tokens : 0), 0)
    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
    const line =
      added === 0 && dropped === 0
        ? 'You are running the repo exactly as it sits on disk — nothing borrowed, nothing dropped. Your repo did not change.'
        : added === 0
          ? `You dropped ${plural(dropped, 'skill')} you had installed. They are still committed, still on disk, still there tomorrow — they just did not load. Your repo did not change.`
          : dropped === 0
            ? `You mounted ${plural(added, 'skill')} you never installed. No directory was created, no commit was made, nothing to uninstall later. Your repo did not change.`
            : `You mounted ${plural(added, 'skill')} you never installed and dropped ${plural(dropped, 'skill')} you did. Nothing was created, nothing was deleted. Your repo did not change.`
    return { nAdded: added, nDropped: dropped, standing: DOSES.benchmarkFloor + tokens, verdict: line }
  }, [mounted])

  /* ---- §04 direction + ladder — ONE line, four bands (N13) ---- */
  // A single rung on one continuous line; its band/surface is READ from the
  // rung (zero=Zero, low·med=Heaven, high·xhigh·max=Hell, ultra=the crown),
  // never chosen as a separate direction. A rung names a direction and a
  // position along skill entropy — never a count.
  const [rung, setRung] = useState<RungId>('low')
  const activeRung = RUNGS.find((r) => r.id === rung)!
  const activeSurface = surfaceById(RUNG_BAND[rung])
  const rungIndex = RUNGS.findIndex((r) => r.id === rung)
  const pickRung = useCallback((id: RungId) => setRung(id), [])

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const section = (location.state as { scrollTo?: string } | null)?.scrollTo ?? searchParams.get('section')
    if (section) {
      const timer = window.setTimeout(() => {
        const el = document.getElementById(section)
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return () => window.clearTimeout(timer)
    }
  }, [location])
  // In-page nav uses #hash anchors, but this app runs under a HashRouter — a
  // bare #id would be read as a route and bounce to the hero. Intercept those
  // clicks and scroll instead. External (http) links pass through.
  const onLpAnchorClick = useCallback((e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a[href^="#"]') as HTMLAnchorElement | null
    if (!a) return
    const id = a.getAttribute('href')?.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])
  const onLadderKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const next = Math.min(RUNGS.length - 1, Math.max(0, rungIndex + (e.key === 'ArrowRight' ? 1 : -1)))
      pickRung(RUNGS[next].id)
    },
    [pickRung, rungIndex],
  )

  return (
    <div className="lp" onClick={onLpAnchorClick}>
      {/* ---------------------------------------------------------------- nav */}
      <a className="lp-skip" href="#doors">
        Skip to the doors
      </a>
      <nav className="lp-nav" aria-label="Primary">
        <div className="lp-nav__brand">
          <a className="lp-nav__back" href="#/" aria-label="Back to the door">
            <span aria-hidden="true">←</span> THE DOOR
          </a>
          <img className="lp-nav__logo" src={brandLogo} alt="" aria-hidden="true" />
          <span className="lp-nav__name">{SITE.repoName}</span>
          <span className="lp-nav__wip">{SITE.version}</span>
        </div>
        <div className="lp-nav__right">
          <div className="lp-nav__links">
            <a href="#doors">DOORS</a>
            <a href="#run">TERMINAL</a>
            <a href="#session">SESSION-ONLY</a>
            <a href="#directions">CONVERGE / EXPLORE</a>
            <a href="#house">ECOSYSTEM</a>
          </div>
          <a className="lp-nav__cta" href="#doors">
            {DOORS[0].launch} <span aria-hidden="true">⏎</span>
          </a>
        </div>
      </nav>

      {/* ------------------------------------------------------------- arrival */}
      <header className="lp-head">
        <div className="lp-head__grid">
          <div className="lp-head__main">
            <div className="lp-head__lede">
              <div className="lp-kicker">
                <span>HELL · HEAVEN · INDEX</span>
                <span className="lp-kicker__rule" aria-hidden="true" />
                <span>THE LAUNCHER</span>
                <span className="lp-reg" aria-hidden="true" />
                <span className="lp-reg-dots" aria-hidden="true">
                  <i />
                  <i />
                </span>
              </div>
              <h1 className="lp-h1">
                You are inside.
                <br />
                Now pick your door.
              </h1>
              <p className="lp-lede">
                <b>Skill Zero</b> composes a lean skill surface at launch — it builds flags and execs
                your harness. Nothing installed, nothing mutated, nothing left behind. From inside the
                session, <code>{MECHANIC.floor}</code> borrows a skill for exactly as long as you need
                it, and <b>Skill Heaven</b> and <b>Skill Hell</b> are that same summon pointed two
                ways.
              </p>
              <SlashReel />
            </div>

            <div className="lp-dose sh-panel">
              <div className="lp-dose__head">
                <div className="lp-dose__title-wrap">
                  <span className="sh-label">STANDING DOSE · MEASURED</span>
                  <InfoTooltip
                    align="left"
                    label="How standing dose is measured"
                    content={
                      <>
                        <p>
                          <b>Standing Dose Tax</b>: Every skill not needed for a turn is still context. The model reads and weighs it before generating tokens. Skill Zero cuts this to the minimum product floor.
                        </p>
                        <p style={{ marginTop: 6 }}>
                          {DOSES.note}
                        </p>
                      </>
                    }
                  />
                </div>
                <span className="lp-dose__delta">{DOSES.deltaVsNative} vs native</span>
              </div>
              <div className="lp-bars">
                <DoseBar label="native, as shipped" value={DOSES.native} max={DOSES.native} tone="inert" />
                <DoseBar
                  label="benchmark floor"
                  value={DOSES.benchmarkFloor}
                  max={DOSES.native}
                  tone="cyan"
                />
                <DoseBar
                  label="product floor"
                  value={DOSES.productFloor}
                  max={DOSES.native}
                  tone="mint"
                  strong
                />
              </div>
            </div>
          </div>

          <figure className="lp-figure">
            <img className="lp-figure__bg" src={bgZero} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            <img
              className="lp-figure__fig"
              src={lucyZero}
              alt="Skill Zero: the line's figure at rest, a single katana in hand — nothing summoned yet."
              width={1024}
              height={1536}
              loading="lazy"
              decoding="async"
            />
            <figcaption className="sh-label">SKILL ZERO · THE LAUNCHER</figcaption>
          </figure>
        </div>
      </header>

      {/* ------------------------------------------------------------------ 01 */}
      <section className="lp-section" id="doors">
        <SectionHead n="01" title="SAME HARNESS, ZERO BLOAT." />
        <p className="lp-section__lede">
          Pick your harness door. Every door launches with zero unneeded standing dose, mounts{' '}
          <code>/summon</code> natively into your session, and leaves your repository byte-identical.
        </p>

        <div className="lp-doors">
          {DOORS.map((d) => {
            const on = d.id === pickedId
            return (
              <button
                key={d.id}
                type="button"
                className={`lp-door lp-door--${d.id}${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => setPickedId(d.id)}
              >
                <span className="lp-door__tick" aria-hidden="true" />
                <HarnessMark
                  id={d.id}
                  harness={d.harness}
                  className="lp-door__mark"
                  letterClassName="lp-door__mark lp-door__mark--letter"
                />
                <span className="lp-door__pkg">{d.pkg}</span>
                <span className="lp-door__harness">{d.harness}</span>
                <span className={`sh-chip lp-door__chip${d.status === 'flagship' ? ' lp-door__chip--flagship' : ''}`}>
                  {d.status}
                </span>
              </button>
            )
          })}
        </div>

        <div className="lp-install">
          <div className="lp-install__panel">
            <div className="lp-install__head">
              <div className="lp-install__title">
                <div className="lp-install__title-wrap">
                  <span className="sh-label">STEP 01 · INSTALL LAUNCHERS</span>
                  <InfoTooltip
                    align="left"
                    label="Launcher installation details"
                    content={
                      <>
                        <p>
                          <b>Source-Built Launchers</b>: Installs all five standalone <code>*-zero</code> binaries directly to your local PATH.
                        </p>
                        <p style={{ marginTop: 6 }}>
                          Uninstall is one script: <code>{platform === 'windows' ? INSTALL.uninstallPs1 : INSTALL.uninstall}</code>
                        </p>
                      </>
                    }
                  />
                </div>
                <p className="lp-install__prose">
                  Installs the five standalone <code>*-zero</code> launcher doors. Never touches your harness configs or repository files.
                </p>
              </div>
              <div className="lp-install__controls">
                <PlatformToggle platform={platform} onToggle={setPlatform} />
              </div>
            </div>

            <CommandBlock
              cmd={platform === 'windows' ? INSTALL.shPs1 : INSTALL.sh}
              sigil={PLATFORM_COMMANDS[platform].sigil}
              tone="mint"
              copied={copied === 'install-launchers'}
              onCopy={() =>
                copy(
                  platform === 'windows' ? INSTALL.shPs1 : INSTALL.sh,
                  'install-launchers',
                )
              }
              label="launcher-only install command"
            />
            <p className="lp-install__note">
              {platform === 'windows' ? INSTALL.shPs1Note : INSTALL.shNote}
            </p>
          </div>

          <div className="lp-install__panel lp-install__panel--launch sh-panel">
            <div className="sh-label">
              STEP 02 · LAUNCH {picked.harness.toUpperCase()}
            </div>
            <CommandBlock
              cmd={picked.launch}
              sigil="$"
              tone="violet"
              copied={copied === 'launch'}
              onCopy={() => copy(picked.launch, 'launch')}
              label="launch command"
            />
            <p className="lp-install__prose">{doorNote(picked)}</p>
          </div>
        </div>
        <p className="lp-fineprint">
          LAUNCHER DELIVERY · Source-delivered through <code>install.sh</code> (or <code>install.ps1</code> on Windows). To load into an existing session without launchers, see the <b>Agent Plugin</b> in the Demo section below.
        </p>
      </section>

      {/* ------------------------------------------------------------------ 02 */}
      <section className="lp-section" id="run">
        <SectionHead n="02" title="DEMO" />
        <p className="lp-section__lede">
          Watch the live multi-agent simulation below, or mount <code>{MECHANIC.floor}</code> into your existing session with the portable Agent Plugin.
        </p>

        {/* In-Session Delivery / Plugin Install Panels */}
        <div className="lp-plugin-box sh-panel">
          <div className="lp-plugin-box__head">
            <div className="lp-plugin-box__title-wrap">
              <span className="sh-label">IN-SESSION DELIVERY · LOAD INTO YOUR HARNESS</span>
              <InfoTooltip
                align="left"
                label="Agent Plugin details"
                content={
                  <>
                    <p>
                      <b>Agent Plugins standard</b>: Pinned compatibility paths for Codex · Grok · Hermes · Claude · Pi. The client manages its own registration and cache lifecycle.
                    </p>
                    <p style={{ marginTop: 6 }}>
                      Uninstall script: <code>{platform === 'windows' ? INSTALL.uninstallPs1 : INSTALL.uninstall}</code>
                    </p>
                  </>
                }
              />
            </div>
            <div className="lp-plugin-box__controls">
              <PlatformToggle platform={platform} onToggle={setPlatform} />
              <div className="lp-seg" role="group" aria-label="Session plugin route">
                <button
                  type="button"
                  className={`lp-seg__btn${pluginMode === 'agent-plugin' ? ' is-on' : ''}`}
                  aria-pressed={pluginMode === 'agent-plugin'}
                  onClick={() => setPluginMode('agent-plugin')}
                >
                  Agent Plugin (All Clients)
                </button>
                <button
                  type="button"
                  className={`lp-seg__btn${pluginMode === 'claude' ? ' is-on' : ''}`}
                  aria-pressed={pluginMode === 'claude'}
                  onClick={() => setPluginMode('claude')}
                >
                  Claude tested
                </button>
              </div>
            </div>
          </div>

          <div className="lp-plugin-box__content">
            {pluginMode === 'agent-plugin' ? (
              <>
                <CommandBlock
                  cmd={platform === 'windows' ? INSTALL.agentPluginPs1.command : AGENT_PLUGIN_COMMAND}
                  sigil={PLATFORM_COMMANDS[platform].sigil}
                  tone="mint"
                  copied={copied === 'install-agent-plugin'}
                  onCopy={() =>
                    copy(
                      platform === 'windows'
                        ? INSTALL.agentPluginPs1.command
                        : AGENT_PLUGIN_COMMAND,
                      'install-agent-plugin',
                    )
                  }
                  label="Agent Plugin installer command"
                />
                <p className="lp-plugin-box__note">
                  {platform === 'windows' ? INSTALL.agentPluginPs1.note : AGENT_PLUGIN_NOTE}
                </p>
              </>
            ) : (
              <>
                <div className="lp-install__lines">
                  {CLAUDE_COMPATIBILITY.map((line, i) => (
                    <CommandBlock
                      key={line}
                      cmd={line}
                      sigil="›"
                      tone={i === 0 ? 'violet' : 'mint'}
                      copied={copied === `install-claude-${i}`}
                      onCopy={() => copy(line, `install-claude-${i}`)}
                      label={`Claude compatibility command, line ${i + 1} of ${CLAUDE_COMPATIBILITY.length}`}
                    />
                  ))}
                </div>
                <p className="lp-plugin-box__note">{CLAUDE_COMPATIBILITY_NOTE}</p>
              </>
            )}
          </div>
        </div>

        <div className="lp-sampler-ctrls">
          <div className="lp-sampler-tabs" role="group" aria-label="Terminal Sampler Modes">
            <button
              type="button"
              className={`lp-sampler-btn${samplerMode === 'all' ? ' is-active' : ''}`}
              onClick={() => selectSampler('all')}
            >
              ALL FLOW
            </button>
            <button
              type="button"
              className={`lp-sampler-btn${samplerMode === 'summon' ? ' is-active' : ''}`}
              onClick={() => selectSampler('summon')}
            >
              /summon
            </button>
            <button
              type="button"
              className={`lp-sampler-btn${samplerMode === 'heaven' ? ' is-active' : ''}`}
              onClick={() => selectSampler('heaven')}
            >
              /skill-heaven (Converge)
            </button>
            <button
              type="button"
              className={`lp-sampler-btn lp-sampler-btn--hell${samplerMode === 'hell' ? ' is-active' : ''}`}
              onClick={() => selectSampler('hell')}
            >
              /skill-hell (Explore)
            </button>
            <button
              type="button"
              className={`lp-sampler-btn lp-sampler-btn--ultra${samplerMode === 'ultra' ? ' is-active' : ''}`}
              onClick={() => selectSampler('ultra')}
            >
              /skill-ultra (Crown)
            </button>
            <button
              type="button"
              className={`lp-sampler-btn${samplerMode === 'zero' ? ' is-active' : ''}`}
              onClick={() => selectSampler('zero')}
            >
              /skill-zero
            </button>
          </div>
          <div className="lp-sampler-actions">
            <InfoTooltip
              variant="badge"
              badgeText="PROTOTYPE NOTICE"
              align="right"
              label="Prototype & simulation notice"
              content={
                <>
                  <p>
                    <b>Active Research Prototype</b> — The Hell/Heaven benchmark is under construction and not yet measured; consider the working product as such.
                  </p>
                  <p style={{ marginTop: 6 }}>
                    For demo purposes, this terminal simulates and reenacts the live product mechanics and dual-track orchestration.
                  </p>
                </>
              }
            />
            <button type="button" className="lp-ghost" onClick={replay}>
              ↻ REPLAY
            </button>
          </div>
        </div>

        {/* Claude Code Terminal TUI Mock */}
        <div
          className={`lp-cc-term${hell ? ' is-hell' : ''}${shear ? ' is-shearing' : ''}`}
          role="img"
          aria-label="Simulated Claude Code terminal session: /summon borrows a skill for this session, /skill-heaven arms converge, and /skill-hell arms explore."
        >
          {/* Header Block: authentic Claude ASCII mark + metadata */}
          <div className="lp-cc-header">
            <ClaudeTerminalLogo className="lp-cc-logo-art" />
            <div className="lp-cc-header-text">
              <div>
                <b>Claude Code</b> <span className="lp-cc-dim">{picked.status === 'flagship' ? 'v2.1.198' : 'v2.1.198 · plugin'}</span>
              </div>
              <div className="lp-cc-dim">Claude Opus 5 with thinking · Claude Max</div>
              <div className="lp-cc-dim">~/gaia-skill-tree</div>
            </div>
          </div>

          <div className="lp-cc-body" ref={bodyRef} onScroll={handleBodyScroll}>
            {history.map((item, hIdx) => {
              const turn = CLAUDE_TURNS[item.turnIdx]

              return (
                <div className="lp-cc-turn" key={hIdx}>
                  <div className="lp-cc-prompt-row">
                    <span className="lp-cc-prompt-glyph">
                      {turn.automated ? (turn.palette === 'hell' ? '◈' : '♛') : '❯'}
                    </span>
                    <span className="lp-cc-user-cmd">{turn.cmd}</span>
                  </div>

                  {item.showTitle && (
                    <div className="lp-cc-response">
                      <div className="lp-cc-res-title">
                        <span className={`lp-cc-bullet lp-cc-bullet--${turn.bulletTone}`}>●</span>{' '}
                        {turn.title}
                      </div>
                      {turn.lines.slice(0, item.linesCount).map((line, li) => (
                        <div className="lp-cc-line-wrap lp-cc-line-in" key={li}>
                          {typeof line === 'string' ? (
                            <div className="lp-cc-dim">&nbsp;&nbsp;{line}</div>
                          ) : (
                            <div className="lp-cc-pill-wrap">{line}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Active Claude Code verb or Paused Ready status */}
            {history.length > 0 && (
              <div className="lp-cc-working-row">
                {activeVerb ? (
                  <>
                    <span className="lp-cc-working">
                      <span className="lp-cc-braille">{BRAILLE[brailleIdx]}</span> {activeVerb}
                    </span>{' '}
                    <span className="lp-cc-dim">(esc to interrupt)</span>
                  </>
                ) : (
                  <>
                    <span className="lp-cc-ready-dot" aria-hidden="true">
                      ●
                    </span>{' '}
                    <span className="lp-cc-ready-label">Ready</span>{' '}
                    <span className="lp-cc-dim">
                      ({CLAUDE_TURNS[history[history.length - 1].turnIdx].readyTiming} · esc to interrupt)
                    </span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* TUI Bottom Status & Input Bar */}
          <div className="lp-cc-bottom">
            <div className="lp-cc-rule" />
            <div className="lp-cc-input-line">
              <span className="lp-cc-prompt-glyph" aria-hidden="true">❯</span>
              <span className="lp-cc-input-text">
                {currentInput}
                <span className="lp-cc-cursor" aria-hidden="true" />
              </span>
            </div>
            <div className="lp-cc-rule" />
            <div className="lp-cc-status-row">
              <span className="lp-cc-cyan">~/gaia-skill-tree</span>
              <span className="lp-cc-gy"> &gt; </span>
              <span className="lp-cc-yellow">master *</span>
              <span className="lp-cc-green"> ↑1</span>
              <span className="lp-cc-gy"> &gt; ctx ──────── </span>
              <span className="lp-cc-green">3%</span>
              <span className="lp-cc-gy"> 31k/1M</span>
            </div>
            <div className="lp-cc-status-row">
              <span className="lp-cc-coral">⏵⏵ bypass permissions on</span>
              <span className="lp-cc-dim"> (shift+tab to cycle)</span>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 03 */}
      <section className="lp-section" id="session">
        <SectionHead n="03" title={<>SKILLS LIVE IN YOUR SESSION.<br />SUMMON ONLY WHEN YOU NEED IT.</>} tight />
        <p className="lp-section__lede">
          Installing a skill edits your repo. It becomes a directory, a commit, a thing you maintain
          — and it loads on every turn whether the task needs it or not. Summoning makes the loadout{' '}
          <b>session-only</b>: mount skills you never installed, drop ones you did, and the repo on
          disk never moves.
        </p>

        <div className="lp-beats">
          <div className="lp-beat">
            <div className="sh-label lp-beat__n">BEAT 01</div>
            <p>
              <b>Installing is permanent.</b> It is a diff you own forever.
            </p>
          </div>
          <div className="lp-beat lp-beat--violet">
            <div className="sh-label lp-beat__n">BEAT 02</div>
            <p>
              <b>Summoning is borrowed.</b> The loadout lives for one session.
            </p>
          </div>
          <div className="lp-beat lp-beat--mint">
            <div className="sh-label lp-beat__n">BEAT 03</div>
            <p>
              <b>Nothing is left behind.</b> The tree on disk is byte-identical.
            </p>
          </div>
        </div>

        <div className="lp-story">
          <div className="lp-story__disk">
            <div className="lp-story__head">
              <span className="sh-label">ON DISK · YOUR REPO</span>
              <span className="sh-chip">FROZEN</span>
            </div>
            <pre className="lp-tree">{`my-project/
├─ .claude/
│  └─ skills/
│     ├─ code-review/
│     ├─ tdd/
│     └─ diagnose/
├─ src/
├─ CLAUDE.md
└─ package.json`}</pre>
            <p className="lp-story__foot">
              3 skills committed · every one of them loads on every turn ·{' '}
              <b>0 diffs this session</b>
            </p>
          </div>

          <div className="lp-story__session">
            <div className="lp-story__head">
              <span className="sh-label lp-story__path">THIS SESSION · {SESSION_DIR}</span>
              <div className="lp-story__head-badges">
                <span className="sh-chip lp-chip--violet">DISPOSABLE</span>
                <InfoTooltip
                  align="right"
                  label="Session lifecycle information"
                  content={
                    <p>
                      Click any row to mount or drop it for this session. Rows marked <b>skill-tree</b> were never installed here — standing dose recomputes off the benchmark floor of {fmt(DOSES.benchmarkFloor)} tok.
                    </p>
                  }
                />
              </div>
            </div>
            <div className="lp-counters">
              <Counter label="MOUNTED" value={fmt(mounted.length)} />
              <Counter label="ADDED" value={fmt(nAdded)} tone="cyan" />
              <Counter label="DROPPED" value={fmt(nDropped)} tone="amber" />
              <Counter label="STANDING" value={fmt(standing)} tone="mint" />
            </div>
            <div className="lp-rows">
              {SESSION_ROWS.map((r) => {
                const on = isOn(r.id)
                const src = on ? r.origin : r.origin === 'repo' ? 'dropped' : 'available'
                return (
                  <button
                    key={r.id}
                    type="button"
                    className={`lp-row${on ? ' is-on' : ''} lp-row--${r.origin}`}
                    aria-pressed={on}
                    onClick={() => toggleRow(r.id)}
                  >
                    <span className="lp-row__mark" aria-hidden="true">
                      {on ? '●' : '○'}
                    </span>
                    <span className="lp-row__name">{r.id}</span>
                    <span className="lp-row__src">{src}</span>
                    <span className="lp-row__tok">{on ? fmt(r.tokens) : '—'}</span>
                  </button>
                )
              })}
            </div>
            <p className="lp-story__foot">
              Click any row to mount or drop it. Rows marked <b>skill-tree</b> were never installed
              here — standing dose recomputes off the benchmark floor of{' '}
              {fmt(DOSES.benchmarkFloor)} tok.
            </p>
          </div>
        </div>

        <div className="lp-verdict">
          <div className="lp-verdict__cmd">
            <span className="lp-k-ok">$</span>
            <span className="lp-verdict__dim">git status</span>
            <span className="lp-verdict__arrow" aria-hidden="true">
              →
            </span>
            <span>nothing to commit, working tree clean</span>
          </div>
          <p className="lp-verdict__line" aria-live="polite">
            {verdict}
          </p>
          <p className="lp-verdict__foot">
            composes → execs → exits. The only writes happened inside <b>{SESSION_DIR}</b>, and it
            died with the process. Nothing stashed, nothing restored, nothing to undo.
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 04 */}
      <section className="lp-section" id="directions">
        <SectionHead n="04" title="HEAVEN OR HELL?" />
        <p className="lp-section__lede">Here’s how you choose.</p>

        {/* 1. Skill Zero & /summon in its own dedicated area */}
        <div
          className={`lp-zero-card${activeSurface.id === 'zero' ? ' is-highlighted' : ''}`}
          onClick={() => pickRung('zero')}
          role="button"
          tabIndex={0}
          aria-label="Skill Zero · The floor"
        >
          <div className="lp-zero-card__main">
            <div className="lp-zero-card__head">
              <img className="lp-zero-card__icon" src={SURFACE_ICON.zero} alt="" aria-hidden="true" />
              <div>
                <div className="lp-zero-card__cmd-row">
                  <h3 className="lp-zero-card__cmd">/skill-zero</h3>
                  <span className="sh-chip sh-chip--live">THE FLOOR</span>
                </div>
                <div className="lp-zero-card__role">THE LAUNCHER · ZERO BLOAT</div>
              </div>
            </div>
            <p className="lp-zero-card__blurb">
              {surfaceById('zero').blurb}
            </p>
            <p className="lp-zero-card__note">
              {MECHANIC.floorNote}
            </p>
          </div>
          <div className="lp-zero-card__reach">
            <div className="lp-zero-card__reach-head">
              <span className="lp-zero-card__glyph" aria-hidden="true">○</span>
              <h4>REACH FOR /SKILL-ZERO</h4>
            </div>
            <ul className="lp-zero-card__reach-list">
              {['benchmarking', 'clean slate', 'everything vanilla', 'removing skill bloat'].map((row, i) => (
                <li key={i}>
                  <span aria-hidden="true">→</span>
                  <span>{row}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 2. Three columns: Skill-Heaven, Skill-Hell (inverted), and Skill-Ultra + Reach */}
        <div className="lp-directions-grid">
          {([
            {
              id: 'heaven' as const,
              defaultRung: 'low' as const,
              glyph: '◆',
              kcls: 'lp-k-violet',
              reach: ['brainstorming', 'grilling sessions', 'iterating', 'human-in-the-loop'],
            },
            {
              id: 'hell' as const,
              defaultRung: 'high' as const,
              glyph: '◈',
              kcls: 'lp-k-amber',
              reach: ['exploring options', 'yolo-ing', 'let the expert decide', 'full agentic autonomy'],
            },
            {
              id: 'ultra' as const,
              defaultRung: 'ultra' as const,
              glyph: '✦',
              kcls: 'lp-k-gold',
              reach: ['controlled autonomy', 'no dial to set', 'maximize quality', 'fully equipped agent'],
            },
          ] as const).map(({ id, defaultRung, glyph, kcls, reach }) => {
            const s = surfaceById(id)
            const isHighlighted = activeSurface.id === id
            return (
              <article
                key={id}
                className={`lp-dir-card lp-dir-card--${id}${isHighlighted ? ' is-highlighted' : ''}`}
                onClick={() => pickRung(defaultRung)}
              >
                <div className="lp-dir-card__head">
                  <div className="lp-dir-card__brand">
                    <img className="lp-dir-card__icon" src={SURFACE_ICON[id]} alt="" aria-hidden="true" />
                    <div>
                      <h3 className="lp-dir-card__cmd">{s.command}</h3>
                      <div className="lp-dir-card__role">{s.role}</div>
                    </div>
                  </div>
                  <span className="sh-chip sh-chip--wip">WIP</span>
                </div>

                <p className="lp-dir-card__blurb">{s.blurb}</p>

                {s.stamp && (
                  <a
                    className="lp-dir-card__stamp"
                    href={HOUSES[0].href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="lp-dir-card__stamp-tag">{s.stamp.label}</span>
                    <span className="lp-dir-card__stamp-note">{s.stamp.note} ↗</span>
                  </a>
                )}

                <div className="lp-dir-card__reach">
                  <div className="lp-dir-card__reach-head">
                    <span className={`lp-dir-card__glyph ${kcls}`} aria-hidden="true">
                      {glyph}
                    </span>
                    <h4>REACH FOR {s.command.toUpperCase()}</h4>
                  </div>
                  <ul className="lp-dir-card__reach-list">
                    {reach.map((row, i) => (
                      <li key={i}>
                        <span className={kcls} aria-hidden="true">
                          →
                        </span>
                        <span>{row}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="lp-dir-card__foot">
                  {id === 'heaven' ? (
                    <span className="sh-label">BAND · low · med · opens low</span>
                  ) : id === 'hell' ? (
                    <span className="sh-label">BAND · high · xhigh · max · opens high</span>
                  ) : (
                    <span className="sh-label">ULTRA · the crown of the line</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        {/* the ladder */}
        <div className="lp-ladder">
          <div className="lp-ladder__head">
            <div>
              <div className="lp-ladder__title-wrap">
                <span className="sh-label">
                  THE LADDER · SKILL ENTROPY · zero · low · med · high · xhigh · max · ultra
                </span>
                <InfoTooltip
                  variant="badge"
                  badgeText="WIP · PROVISIONAL"
                  align="left"
                  label="Entropy Ladder details"
                  content={
                    <>
                      <p><b>Skill Entropy Measure</b>: {LADDER_MEASURE}</p>
                      <p style={{ marginTop: 6 }}><b>Calibration</b>: {LADDER_WIP}</p>
                      <p style={{ marginTop: 6 }}><b>Stamps & Routing</b>: {STAMP_ROUTING_NOTE}</p>
                      <p style={{ marginTop: 6 }}><b>One MCP</b>: Heaven and Hell are two directions of the same summon. A rung names a direction and position, never a count.</p>
                    </>
                  }
                />
              </div>
            </div>
            <div className="lp-ladder__band">
              <img
                className="lp-ladder__bandicon"
                src={SURFACE_ICON[activeSurface.id]}
                alt=""
                aria-hidden="true"
              />
              <span className="sh-label" style={{ color: activeSurface.hue }}>
                {activeSurface.name} · {activeSurface.role}
              </span>
            </div>
          </div>

          <div
            className="lp-stops"
            role="group"
            aria-label={`Ladder rung — currently ${activeRung.id}, ${activeSurface.name}`}
            onKeyDown={onLadderKey}
          >
            {RUNGS.map((r, i) => {
              const on = r.id === activeRung.id
              const band = RUNG_BAND[r.id]
              const opensHere = (band === 'heaven' && r.id === 'low') || (band === 'hell' && r.id === 'high')
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`lp-stop lp-stop--${band}${on ? ' is-on' : ''}${i <= rungIndex ? ' is-below' : ''}`}
                  aria-pressed={on}
                  onClick={() => pickRung(r.id)}
                >
                  <span className="lp-stop__detent" aria-hidden="true" />
                  <span className="lp-stop__id">{r.id}</span>
                  <span className="lp-stop__def">{opensHere ? 'opens' : ' '}</span>
                </button>
              )
            })}
          </div>

          <div className="lp-ladder__read" aria-live="polite">
            <div className="lp-ladder__count">
              <span className="lp-ladder__n" style={{ color: activeSurface.hue }}>
                {DIRECTION_WORD[activeRung.direction]}
              </span>
              <span className="sh-label">{activeRung.position}</span>
            </div>
            <p className="lp-ladder__note">{activeRung.note}</p>
          </div>
          <p className="lp-ladder__wipnote">
            <span className="sh-chip sh-chip--wip">WIP</span> {LADDER_WIP}
          </p>
        </div>

        <div className="sh-note lp-ann">
          <span className="lp-ann__mark" aria-hidden="true">
            ▨
          </span>
          <span>
            ONE MCP · Heaven and Hell are the same summon pointed two ways along skill entropy. A
            rung names a direction and a position, never a count, and <b>{MECHANIC.floor}</b> still
            works by hand at every rung, including <b>zero</b>. Rungs are discrete stops, never a
            continuous fader. Nothing on the line refuses.
          </span>
        </div>
      </section>

      {/* ------------------------------------------------------------------ 05 */}
      <section className="lp-section" id="house">
        <SectionHead n="05" title="ONE HOUSE, THREE ROOMS" />
        <p className="lp-section__lede">
          Research proves it, the registry records it, the launcher runs it. Each room keeps its own
          colour.
        </p>
        <div className="lp-rooms">
          {HOUSES.map((h) => {
            const inner = (
              <>
                <span className="lp-room__tick" aria-hidden="true" style={{ background: h.hue }} />
                <div className="lp-room__label" style={{ color: h.hue }}>
                  {h.room.toUpperCase()}
                </div>
                <h3 className="lp-room__name">{h.name}</h3>
                <p className="lp-room__blurb">{h.blurb}</p>
                <div className="lp-room__action" style={{ color: h.href ? h.hue : undefined }}>
                  {h.action}
                  {h.href ? <span aria-hidden="true"> ↗</span> : null}
                </div>
              </>
            )
            return h.href ? (
              <a
                className="lp-room"
                key={h.id}
                href={h.href}
                style={{ borderColor: h.hue }}
                target="_blank"
                rel="noreferrer"
              >
                {inner}
              </a>
            ) : (
              <div className="lp-room lp-room--here" key={h.id} style={{ borderColor: h.hue }}>
                {inner}
              </div>
            )
          })}
        </div>
      </section>

      {/* --------------------------------------------------------- closing art */}
      <section className="lp-section lp-closer" aria-hidden="true">
        <div className="lp-closer__row">
          <div className="lp-closer__frame lp-closer__frame--heaven">
            <img className="lp-closer__bg" src={bgHeaven} alt="" loading="lazy" decoding="async" />
            <img className="lp-closer__figure" src={lucyHeaven} alt="" loading="lazy" decoding="async" />
            <span className="lp-closer__tag sh-label">CONVERGE</span>
          </div>
          <div className="lp-closer__frame lp-closer__frame--hell">
            <img className="lp-closer__bg" src={bgHell} alt="" loading="lazy" decoding="async" />
            <img className="lp-closer__figure" src={lucyHell} alt="" loading="lazy" decoding="async" />
            <span className="lp-closer__tag sh-label">EXPLORE</span>
          </div>
          <div className="lp-closer__frame lp-closer__frame--ultra">
            <img className="lp-closer__bg" src={bgUltra} alt="" loading="lazy" decoding="async" />
            <img className="lp-closer__figure" src={lucyUltra} alt="" loading="lazy" decoding="async" />
            <span className="lp-closer__tag sh-label">THE CROWN</span>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="lp-foot">
        <div className="lp-foot__cols">
          <div className="lp-foot__brand">
            <div className="lp-foot__mark">
              <img className="lp-foot__logo" src={brandLogo} alt={`${SITE.name} mark`} loading="lazy" decoding="async" />
              <span className="lp-nav__name">{SITE.repoName}</span>
            </div>
            <p className="lp-foot__slot">
              One angel, two directions. Converge toward a plan you approve, or explore a wider
              search — same door, same session, nothing left behind.
            </p>
          </div>
          <FootCol
            title="PRODUCT"
            links={[
              ['Doors', '#doors'],
              ['Watch it run', '#run'],
              ['Session-only skills', '#session'],
              ['Converge or explore', '#directions'],
            ]}
          />
          <FootCol title="SURFACES" links={SURFACES.map((s) => [s.command, '#directions'])} />
          <FootCol
            title="RESEARCH"
            links={[
              ['HH Index ↗', HOUSES[0].href ?? '#house'],
              ['Benchmark method ↗', HOUSES[0].href ?? '#house'],
              ['Gaia Skill Tree ↗', HOUSES[1].href ?? '#house'],
            ]}
          />
          <FootCol
            title="REPO"
            links={[
              ['GitHub ↗', SITE.repoUrl],
              ['Issues ↗', SITE.issuesUrl],
              [SITE.licence, SITE.repoUrl],
            ]}
          />
        </div>

        <div className="lp-foot__band" aria-hidden="true" />

        <div className="lp-wordmark">
          <div className="lp-wordmark__solid">SKILL HEAVEN</div>
          <div className="lp-wordmark__ghost" aria-hidden="true">
            SKILL HELL
          </div>
        </div>

        <div className="lp-foot__bar">
          <span>
            {SITE.version.toUpperCase()} · INSTALLED AS A CLAUDE CODE PLUGIN · NOT ON NPM
          </span>
          <span className="lp-foot__licence">
            <span className="lp-foot__dot" aria-hidden="true" />
            GAIA RESEARCH · {SITE.licence.toUpperCase()}
          </span>
        </div>
      </footer>
    </div>
  )
}

/* =========================================================================
   small parts
   ========================================================================= */

function SectionHead({
  n,
  title,
  tight,
}: {
  n: string
  title: ReactNode
  tight?: boolean
}) {
  return (
    <div className="lp-shead">
      <span className="lp-shead__n">{n}</span>
      <span className="sh-rule lp-shead__rule" aria-hidden="true" />
      <h2 className={`sh-h2${tight ? ' lp-shead__h2--tight' : ''}`}>{title}</h2>
    </div>
  )
}

function DoseBar({
  label,
  value,
  max,
  tone,
  strong,
}: {
  label: string
  value: number
  max: number
  tone: 'inert' | 'cyan' | 'mint'
  strong?: boolean
}) {
  return (
    <div className="lp-bar">
      <div className={`lp-bar__top${strong ? ' is-strong' : ''}`}>
        <span>{label}</span>
        <span>{fmt(value)} tok</span>
      </div>
      <div className="lp-bar__track">
        <div
          className={`lp-bar__fill lp-bar__fill--${tone}`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
    </div>
  )
}

function Counter({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'cyan' | 'amber' | 'mint'
}) {
  return (
    <div className="lp-counter">
      <div className="sh-label">{label}</div>
      <div className={`lp-counter__v${tone ? ` lp-counter__v--${tone}` : ''}`}>{value}</div>
    </div>
  )
}

function CommandBlock({
  cmd,
  sigil,
  tone,
  copied,
  onCopy,
  label,
}: {
  cmd: string
  sigil: string
  tone: 'mint' | 'violet'
  copied: boolean
  onCopy: () => void
  label: string
}) {
  return (
    <div className="lp-cmd">
      <span className={`lp-cmd__sigil lp-k-${tone}`} aria-hidden="true">
        {sigil}
      </span>
      <code className="lp-cmd__code">{cmd}</code>
      <button type="button" className="lp-cmd__copy" onClick={onCopy}>
        {copied ? 'COPIED' : 'COPY'}
        <span className="lp-sr">{` ${label}`}</span>
      </button>
    </div>
  )
}

function FootCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div className="lp-foot__col">
      <div className="sh-label">{title}</div>
      <div className="lp-foot__links">
        {links.map(([text, href]) => (
          <a key={text + href} href={href}>
            {text}
          </a>
        ))}
      </div>
    </div>
  )
}
