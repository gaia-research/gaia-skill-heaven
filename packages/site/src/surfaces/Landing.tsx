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

type SamplerMode = 'all' | 'summon' | 'heaven' | 'hell' | 'zero'

const BORROWED = SESSION_ROWS[4] // obra/systematic-debugging, skill-tree origin
const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

interface ClaudeTurn {
  id: 'summon' | 'heaven' | 'hell' | 'zero'
  cmd: string
  bulletTone?: 'coral' | 'heaven' | 'hell'
  verb: string
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
  tone: 'cyan' | 'violet' | 'amber'
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

const CLAUDE_TURNS: ClaudeTurn[] = [
  {
    id: 'summon',
    cmd: `${MECHANIC.floor} systematic debugging`,
    bulletTone: 'coral',
    verb: 'Cogitating…',
    title: (
      <>
        Summoning <span className="cc-file">{BORROWED.id}</span> into session context…
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
    id: 'heaven',
    cmd: '/skill-heaven brainstorm with me a design idea',
    bulletTone: 'heaven',
    verb: 'Ruminating…',
    title: (
      <>
        <span className="cc-cyan">Skill Heaven (converge)</span> auto-summoned 2 skills for design…
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
      <SummonedSkillPill
        key="grill"
        name="mattpocock/grill-me"
        tag="critique"
        tokens="+860 tok"
        tone="violet"
      />,
      '· posture: human-in-the-loop · tight signal · 0 diffs on disk',
    ],
    readyTiming: '480ms',
  },
  {
    id: 'hell',
    cmd: '/skill-hell explore the codebase and autofix security issues',
    bulletTone: 'hell',
    verb: 'Prestidigitating…',
    title: (
      <>
        <span className="cc-amber">Skill Hell (explore)</span> auto-summoned 2 skills via gaia mcp…
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
      '· route: mixture-of-agents · autonomous search · 0 diffs on disk',
    ],
    readyTiming: '680ms',
  },
  {
    id: 'zero',
    cmd: '/skill-zero',
    bulletTone: 'coral',
    verb: 'Recombobulating…',
    title: (
      <>
        <span className="cc-cyan">Skill Zero</span> cleared all borrowed skills · back to floor
      </>
    ),
    lines: [
      '· unmounted pbakaus/impeccable, mattpocock/grill-me, garrytan/cso, obra/systematic-debugging',
      `· standing dose: ${fmt(DOSES.productFloor)} tok (product floor)`,
      '· zero skills in context · 0 diffs on disk · /summon on demand',
    ],
    readyTiming: '240ms',
  },
]

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

export default function Landing() {
  /* ---- §01 doors + install ---- */
  const [pickedId, setPickedId] = useState(DOORS[0].id)
  const picked = DOORS.find((d) => d.id === pickedId) ?? DOORS[0]
  // Three real delivery views: the harness-neutral Agent Plugin installer is
  // primary, Claude's marketplace flow is tested compatibility, and install.sh
  // remains the optional launcher-only route. There is no npx path.
  const [installMode, setInstallMode] = useState<'agent-plugin' | 'claude' | 'sh'>('agent-plugin')
  const [platform, setPlatform] = useState<Platform>('posix')
  const [copied, setCopied] = useState('')
  const copyTimer = useRef<number | undefined>(undefined)

  const installNote =
    installMode === 'agent-plugin'
      ? (platform === 'windows' ? INSTALL.agentPluginPs1.note : AGENT_PLUGIN_NOTE)
      : installMode === 'claude'
        ? CLAUDE_COMPATIBILITY_NOTE
        : (platform === 'windows' ? INSTALL.shPs1Note : INSTALL.shNote)

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(''), 1600)
  }, [])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  /* ---- §02 terminal ---- */
  const [samplerMode, setSamplerMode] = useState<SamplerMode>('all')
  const [history, setHistory] = useState<TurnHistoryState[]>([])
  const [currentInput, setCurrentInput] = useState<string>('')
  const [activeVerb, setActiveVerb] = useState<string>('')
  const [brailleIdx, setBrailleIdx] = useState(0)
  const [hell, setHell] = useState(false)
  const [shear, setShear] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const animTimerRef = useRef<number | undefined>(undefined)
  const shearTimerRef = useRef<number | undefined>(undefined)

  const clearTimers = useCallback(() => {
    if (animTimerRef.current) window.clearTimeout(animTimerRef.current)
    if (shearTimerRef.current) window.clearTimeout(shearTimerRef.current)
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
    (turnIdx: number, onDone: () => void, charDelay = 28) => {
      const turn = CLAUDE_TURNS[turnIdx]
      const fullCmd = turn.cmd
      let charIdx = 0
      setCurrentInput('')

      const typeNextChar = () => {
        if (charIdx < fullCmd.length) {
          charIdx++
          setCurrentInput(fullCmd.slice(0, charIdx))
          animTimerRef.current = window.setTimeout(typeNextChar, charDelay)
        } else {
          // Pause briefly at end of command (simulating Enter keypress)
          animTimerRef.current = window.setTimeout(() => {
            const isHell = turn.id === 'hell'
            if (isHell) {
              setHell(true)
              setShear(true)
              shearTimerRef.current = window.setTimeout(() => setShear(false), 300)
            } else {
              setHell(false)
            }

            // Move command from bottom prompt into top conversation history
            setCurrentInput('')
            setHistory((prev) => [
              ...prev,
              { turnIdx, showTitle: false, linesCount: 0 },
            ])
            // Set ONE single verb for the entire task
            setActiveVerb(turn.verb)

            // Step 1: Reveal title after initial verb loading
            animTimerRef.current = window.setTimeout(() => {
              setHistory((prev) =>
                prev.map((item, idx) =>
                  idx === prev.length - 1 ? { ...item, showTitle: true } : item,
                ),
              )

              // Step 2: Stream lines one by one while keeping the SAME verb
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
                    animTimerRef.current = window.setTimeout(revealNextLine, 360)
                  } else {
                    // Finished all lines in this turn -> Ready state (pause spinner animation)
                    setActiveVerb('')
                    animTimerRef.current = window.setTimeout(
                      onDone,
                      isHell ? 2800 : 1800,
                    )
                  }
                }
              }

              animTimerRef.current = window.setTimeout(revealNextLine, 360)
            }, 440)
          }, 220)
        }
      }

      animTimerRef.current = window.setTimeout(typeNextChar, 120)
    },
    [],
  )

  const playAll = useCallback(() => {
    clearTimers()
    setHell(false)
    setShear(false)
    setHistory([])
    setCurrentInput('')
    setActiveVerb('')

    if (prefersReducedMotion()) {
      setHistory(
        CLAUDE_TURNS.map((_, i) => ({
          turnIdx: i,
          showTitle: true,
          linesCount: CLAUDE_TURNS[i].lines.length,
        })),
      )
      return
    }

    const runTurn = (idx: number) => {
      if (idx >= CLAUDE_TURNS.length) {
        animTimerRef.current = window.setTimeout(() => {
          playAll()
        }, 3600)
        return
      }
      typeAndSubmitCommand(idx, () => runTurn(idx + 1))
    }

    animTimerRef.current = window.setTimeout(() => runTurn(0), 400)
  }, [clearTimers, typeAndSubmitCommand])

  const selectSampler = useCallback(
    (mode: SamplerMode) => {
      clearTimers()
      setSamplerMode(mode)
      if (mode === 'all') {
        playAll()
      } else {
        const turnIdx = CLAUDE_TURNS.findIndex((t) => t.id === mode)
        if (turnIdx !== -1) {
          setHistory([])
          setCurrentInput('')
          setActiveVerb('')
          setHell(false)
          setShear(false)
          if (prefersReducedMotion()) {
            const isHell = mode === 'hell'
            setHell(isHell)
            setHistory([
              {
                turnIdx,
                showTitle: true,
                linesCount: CLAUDE_TURNS[turnIdx].lines.length,
              },
            ])
            return
          }
          typeAndSubmitCommand(turnIdx, () => {})
        }
      }
    },
    [clearTimers, playAll, typeAndSubmitCommand],
  )

  const replay = useCallback(() => {
    selectSampler(samplerMode)
  }, [selectSampler, samplerMode])

  useEffect(() => {
    playAll()
    return clearTimers
  }, [playAll, clearTimers])

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [history, activeVerb, currentInput])

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

  const location = useLocation()
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
                <span className="sh-label">STANDING DOSE · MEASURED</span>
                <span className="lp-dose__delta">{DOSES.deltaVsNative} vs native</span>
              </div>
              <p className="lp-dose__body">
                Every skill you don’t need is still context. The model still has to read it, weigh it,
                decide whether it’s <b>signal or noise</b> — that’s the tax you pay before your first
                real token. Skill Zero cuts it at launch.
              </p>
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
              <p className="lp-dose__foot">{DOSES.note}</p>
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

        <div className="lp-doors">
          {DOORS.map((d) => {
            const on = d.id === pickedId
            return (
              <button
                key={d.id}
                type="button"
                className={`lp-door${on ? ' is-on' : ''}`}
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
                <span className="sh-chip lp-door__chip">{d.status}</span>
              </button>
            )
          })}
        </div>

        <div className="lp-install">
          <div className="lp-install__panel">
            <div className="lp-install__head">
              <div className="lp-install__title">
                <span className="sh-label">INSTALL · AGENT PLUGIN FIRST</span>
                <p className="lp-install__prose">
                  One portable package for any Agent Plugins client. The installer prints the
                  plugin and marketplace paths; it does not guess at or rewrite a harness config.
                </p>
              </div>
              <div className="lp-install__controls">
                <PlatformToggle platform={platform} onToggle={setPlatform} />
                <div className="lp-seg" role="group" aria-label="Install route">
                  <button
                    type="button"
                    className={`lp-seg__btn${installMode === 'agent-plugin' ? ' is-on' : ''}`}
                    aria-pressed={installMode === 'agent-plugin'}
                    onClick={() => setInstallMode('agent-plugin')}
                  >
                    Agent Plugin
                  </button>
                  <button
                    type="button"
                    className={`lp-seg__btn${installMode === 'claude' ? ' is-on' : ''}`}
                    aria-pressed={installMode === 'claude'}
                    onClick={() => setInstallMode('claude')}
                  >
                    Claude tested
                  </button>
                  <button
                    type="button"
                    className={`lp-seg__btn${installMode === 'sh' ? ' is-on' : ''}`}
                    aria-pressed={installMode === 'sh'}
                    onClick={() => setInstallMode('sh')}
                  >
                    launcher-only
                  </button>
                </div>
              </div>
            </div>
            {installMode === 'agent-plugin' ? (
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
            ) : installMode === 'claude' ? (
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
            ) : (
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
            )}
            <p className="lp-install__note">{installNote}</p>
            {installMode === 'agent-plugin' ? (
              <p className="lp-install__note">
                Pinned compatibility paths: <b>Codex · Grok · Hermes · Claude · Pi</b>. Other
                conformant clients may load the same directory through their own registration UI.
              </p>
            ) : null}
          </div>

          <div className="lp-install__panel lp-install__panel--launch sh-panel">
            <div className="sh-label">
              {installMode === 'sh' ? 'HOW TO LAUNCH' : 'THEN, IN THE SESSION'}
            </div>
            {installMode !== 'sh' ? (
              <>
                <CommandBlock
                  cmd={MECHANIC.floor}
                  sigil="›"
                  tone="violet"
                  copied={copied === 'launch'}
                  onCopy={() => copy(MECHANIC.floor, 'launch')}
                  label="summon command"
                />
                <p className="lp-install__prose">
                  Nothing to launch here. The Agent Plugin puts five commands in the session you
                  are already in — <code>/summon</code>, <code>/skill-zero</code>,{' '}
                  <code>/skill-heaven</code>, <code>/skill-hell</code>, and <code>/skill-ultra</code>{' '}
                  — and the summon engine ships inside it. Claude's two-line flow above is the
                  tested compatibility route for that same package.
                </p>
              </>
            ) : (
              <>
                <CommandBlock
                  cmd={picked.launch}
                  sigil="$"
                  tone="violet"
                  copied={copied === 'launch'}
                  onCopy={() => copy(picked.launch, 'launch')}
                  label="launch command"
                />
                <p className="lp-install__prose">{doorNote(picked)}</p>
              </>
            )}
          </div>
        </div>
        <p className="lp-fineprint">
          WORK IN PROGRESS · v0 — the Agent Plugin installer is harness-neutral; Claude’s
          marketplace flow is tested compatibility. The five launcher doors are source-delivered
          separately through <code>install.sh</code> (or <code>install.ps1</code> on Windows). Neither path is on npm. Uninstall is one
          script: <code>{platform === 'windows' ? INSTALL.uninstallPs1 : INSTALL.uninstall}</code>
        </p>
      </section>

      {/* ------------------------------------------------------------------ 02 */}
      <section className="lp-section" id="run">
        <SectionHead n="02" title="DEMO" />
        <p className="lp-section__lede">
          Launch with <code>{DOORS[0].launch}</code>. <code>{MECHANIC.floor}</code> a single skill.
          <code>/skill-hell</code> auto-summons agentic skills for you.
        </p>

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
              /summon (Floor)
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
              className={`lp-sampler-btn${samplerMode === 'zero' ? ' is-active' : ''}`}
              onClick={() => selectSampler('zero')}
            >
              /skill-zero (Clear)
            </button>
          </div>
          <button type="button" className="lp-ghost" onClick={replay}>
            ↻ REPLAY
          </button>
        </div>

        {/* Claude Code Terminal TUI Mock */}
        <div
          className={`lp-cc-term${hell ? ' is-hell' : ''}${shear ? ' is-shearing' : ''}`}
          role="img"
          aria-label="Simulated Claude Code terminal session: /summon borrows a skill for this session, /skill-heaven arms converge, and /skill-hell arms explore."
        >
          {/* Header Block: authentic Claude ASCII mark + metadata */}
          <div className="lp-cc-header">
            <pre className="lp-cc-logo-art" aria-hidden="true">{` ▐▛███▜▌
▝▜█████▛▘
  ▘▘ ▝▝`}</pre>
            <div className="lp-cc-header-text">
              <div>
                <b>Claude Code</b> <span className="lp-cc-dim">{picked.status === 'flagship' ? 'v2.1.198' : 'v2.1.198 · plugin'}</span>
              </div>
              <div className="lp-cc-dim">Claude 3.7 Sonnet with thinking · Claude Max</div>
              <div className="lp-cc-dim">~/gaia-skill-tree</div>
            </div>
          </div>

          <div className="lp-cc-body" ref={bodyRef}>
            {history.map((item, hIdx) => {
              const turn = CLAUDE_TURNS[item.turnIdx]

              return (
                <div className="lp-cc-turn" key={hIdx}>
                  <div className="lp-cc-prompt-row">
                    <span className="lp-cc-prompt-glyph">❯</span>
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
              <span className="lp-cc-prompt-glyph">❯</span>
              <span className="lp-cc-input-text">{currentInput}</span>
              <span className="lp-cc-cursor" />
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
              <span className="sh-chip lp-chip--violet">DISPOSABLE</span>
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

        <div className="sh-note lp-ann">
          <span className="lp-ann__mark" aria-hidden="true">
            ▸
          </span>
          <span>
            STAMPS · <b>heaven-native</b> and <b>hell-safe</b> are the two halves of one question —
            does a skill still carry a gap when few are in context, and does it stay safe when many
            are. {STAMP_ROUTING_NOTE}{' '}
            <a className="lp-ann__link" href={HOUSES[0].href} target="_blank" rel="noreferrer">
              Follow the HH Index ↗
            </a>
          </span>
        </div>

        {/* the ladder */}
        <div className="lp-ladder">
          <div className="lp-ladder__head">
            <div>
              <span className="sh-label">
                THE LADDER · SKILL ENTROPY · zero · low · med · high · xhigh · max · ultra
              </span>
              <span className="sh-chip sh-chip--wip lp-ladder__wip">WIP · PROVISIONAL</span>
              <p className="lp-ladder__measure">{LADDER_MEASURE}</p>
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
