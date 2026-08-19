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
  SURFACES,
  surfaceById,
  type Door,
  type RungId,
  type SurfaceId,
} from '../product'
import '../styles/system.css'
import './landing.css'
import { SlashReel } from './SlashReel'

/* -- the commission: real art, no placeholder slots left except the logo -- */
import lucyZero from '../assets/lucy/v5/masters/lucy-zero.png'
import lucyHeaven from '../assets/lucy/v5/masters/lucy-heaven.png'
import lucyHell from '../assets/lucy/v5/masters/lucy-hell.png'
import lucyUltra from '../assets/lucy/v5/masters/lucy-ultra.png'
import bgZero from '../assets/lucy/backgrounds/lucy-bg-zero-desktop.webp'
import bgHeaven from '../assets/lucy/backgrounds/lucy-bg-heaven-desktop.webp'
import bgHell from '../assets/lucy/backgrounds/lucy-bg-hell-desktop.webp'
import bgUltra from '../assets/lucy/backgrounds/lucy-bg-ultra-desktop.webp'
import katanaHeaven from '../assets/lucy/frontpage/katana-authority-v2/lucy-katana-heaven.webp'
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

/* Harness marks — each is the harness vendor's OWN mark, reduced to a single
   monochrome path so the tile can recolour it (ink-dim, violet when selected).
   Nothing here is redrawn, traced or approximated; source and licence sit with
   each entry.

   `hermes` has no entry ON PURPOSE. Nous Research publishes no vector mark —
   not on nousresearch.com, not on hermes.nousresearch.com, not in the
   NousResearch GitHub org (checked 2026-08-20; the site ships only raster
   favicons and the one detailed SVG on the Hermes download page is Tux). That
   tile carries a lettermark in the site's own type instead of an invented
   logo: a negative result is recorded, not papered over (D8). */
type DoorMark = { viewBox: string; d: string; evenOdd?: boolean }

const DOOR_MARKS: Record<string, DoorMark> = {
  /* claude — Simple Icons (CC0-1.0), 24×24 viewBox, verbatim. */
  claude: {
    viewBox: '0 0 24 24',
    d: 'm4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z',
  },
  /* pi — the Pi Coding Agent's own mark, from the official
     https://pi.dev/favicon.svg (Earendil Works). Glyph only; the source draws
     it knocked out of a dark rounded square, which at 22px would read as a
     black block next to four line marks. */
  pi: {
    viewBox: '0 0 800 800',
    evenOdd: true,
    d: 'M165.29 165.29 H517.36 V400 H400 V517.36 H282.65 V634.72 H165.29 Z M282.65 282.65 V400 H400 V282.65 Z M517.36 400 H634.72 V634.72 H517.36 Z',
  },
  /* codex — OpenAI's symbol. Wikimedia Commons,
     File:OpenAI_logo_2025_(symbol).svg, public domain (the mark is a
     trademark of OpenAI; used nominatively to name the harness). */
  codex: {
    viewBox: '0 0 20 20',
    d: 'M11.248 18.25q-.825 0-1.568-.314a4.3 4.3 0 0 1-1.32-.874 4 4 0 0 1-1.304.214 4 4 0 0 1-2.046-.544 4.27 4.27 0 0 1-1.518-1.485 4 4 0 0 1-.56-2.095q0-.48.131-1.04A4.4 4.4 0 0 1 2.04 10.71a4.07 4.07 0 0 1 .017-3.4 4.2 4.2 0 0 1 1.056-1.418 3.8 3.8 0 0 1 1.6-.842 3.9 3.9 0 0 1 .76-1.683q.593-.759 1.451-1.188a4.04 4.04 0 0 1 1.832-.429q.825 0 1.567.313.742.314 1.32.875a4 4 0 0 1 1.304-.215q1.106 0 2.046.545a4.14 4.14 0 0 1 1.501 1.485q.578.941.578 2.095 0 .48-.132 1.04.66.61 1.023 1.419.363.792.363 1.666 0 .892-.38 1.717a4.3 4.3 0 0 1-1.072 1.435 3.8 3.8 0 0 1-1.584.825 3.8 3.8 0 0 1-.775 1.683 4.06 4.06 0 0 1-1.436 1.188 4.04 4.04 0 0 1-1.832.429m-4.076-2.062q.825 0 1.435-.347l3.103-1.782a.36.36 0 0 0 .164-.313v-1.42L7.881 14.62a.67.67 0 0 1-.726 0l-3.118-1.798a.5.5 0 0 1-.017.115v.198q0 .841.396 1.551.413.693 1.139 1.089a3.2 3.2 0 0 0 1.617.412m.165-2.69a.4.4 0 0 0 .181.05q.083 0 .165-.05l1.238-.71-3.977-2.31a.7.7 0 0 1-.363-.643v-3.58q-.825.362-1.32 1.122a2.9 2.9 0 0 0-.495 1.65q0 .809.413 1.55.412.743 1.072 1.123zm3.91 3.663q.875 0 1.585-.396a2.96 2.96 0 0 0 1.534-2.64v-3.564a.32.32 0 0 0-.165-.297l-1.254-.726v4.604a.7.7 0 0 1-.363.643l-3.119 1.799a3 3 0 0 0 1.783.577m.627-6.039V8.878L10.01 7.822 8.129 8.878v2.244l1.881 1.056zM7.057 5.859a.7.7 0 0 1 .363-.644l3.119-1.798a3 3 0 0 0-1.782-.578q-.874 0-1.584.396A2.96 2.96 0 0 0 6.05 4.324a3.07 3.07 0 0 0-.396 1.551v3.547q0 .199.165.314l1.237.726zm8.383 7.887q.825-.364 1.303-1.123.495-.758.495-1.65a3.15 3.15 0 0 0-.412-1.55q-.413-.743-1.073-1.123l-3.086-1.782q-.099-.065-.181-.049a.3.3 0 0 0-.165.05l-1.238.692 3.993 2.327a.6.6 0 0 1 .264.264.64.64 0 0 1 .1.363zm-3.317-8.382a.63.63 0 0 1 .726 0l3.135 1.831v-.297q0-.792-.396-1.501a2.86 2.86 0 0 0-1.105-1.155q-.71-.43-1.65-.43-.825 0-1.436.347L8.294 5.941a.36.36 0 0 0-.165.314v1.418z',
  },
  /* grok — xAI's Grok symbol. Wikimedia Commons,
     File:Grok_logo_without_text.svg, public domain (trademark of xAI, used
     nominatively). Kept as the knockout tile the brand actually uses — the
     bare slash on its own does not read as Grok. */
  grok: {
    viewBox: '0 0 163.53 163.53',
    evenOdd: true,
    d: 'M0 0H163.53V163.53H0Z M38.72 129.19H58.68L124.98 34.51H105.02Z',
  },
}

const SESSION_DIR = '/tmp/skill-zero-a91f7c'
const fmt = (n: number) => n.toLocaleString('en-US')

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

type TermKind = 'cmd' | 'info' | 'ok' | 'dim'
interface TermLine {
  g: string
  t: string
  k: TermKind
  d: number
  hell?: boolean
}

const BORROWED = SESSION_ROWS[4] // obra/systematic-debugging, skill-tree origin
const HELL_RUNG = RUNGS.find((r) => r.id === 'high')!

const SCRIPT: TermLine[] = [
  { g: '$', t: 'claude-zero', k: 'cmd', d: 540 },
  { g: '▸', t: 'compose   flags for claude code · zero shared state touched', k: 'info', d: 300 },
  { g: '▸', t: `session   ${SESSION_DIR}   (mkdtemp · disposable)`, k: 'info', d: 300 },
  { g: '▸', t: "surface   bundled OFF · mcp {gaia} · setting-sources ''", k: 'info', d: 300 },
  {
    g: '▸',
    t: `dose      ${fmt(DOSES.productFloor)} tok standing   ·   ${DOSES.deltaVsNative} vs native ${fmt(DOSES.native)}`,
    k: 'info',
    d: 340,
  },
  { g: '✓', t: 'exec      claude   (composed → exec’d · nothing installed)', k: 'ok', d: 860 },
  { g: '›', t: `${MECHANIC.floor} "systematic debugging"`, k: 'cmd', d: 480 },
  { g: ' ', t: 'gap       no debugging skill in context', k: 'dim', d: 300 },
  {
    g: ' ',
    t: `summon    ${BORROWED.id}   +${fmt(BORROWED.tokens)} tok   · this session only`,
    k: 'dim',
    d: 320,
  },
  { g: '✓', t: 'mounted   1 skill · borrowed · nothing written to your repo', k: 'ok', d: 940 },
  { g: '›', t: `/skill-hell ${HELL_RUNG.id}`, k: 'cmd', d: 440, hell: true },
  {
    g: ' ',
    t: `ladder    ${HELL_RUNG.id} · ${HELL_RUNG.direction} · ${HELL_RUNG.position}   [WIP · provisional]`,
    k: 'dim',
    d: 340,
  },
  { g: ' ', t: 'route     gaia mcp · explore · more experts in context', k: 'dim', d: 340 },
  { g: '✓', t: `armed     ${MECHANIC.floor} still works by hand at every rung`, k: 'ok', d: 1600 },
]

const HELL_INDEX = SCRIPT.findIndex((l) => l.hell)

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
  // Two real install routes, settled in docs/AGENT-PLUGIN.md: the plugin is
  // primary (two lines inside Claude Code), install.sh is the optional route
  // for the five standalone launcher doors. There is no npx path.
  const [installMode, setInstallMode] = useState<'plugin' | 'sh'>('plugin')
  const [copied, setCopied] = useState('')
  const copyTimer = useRef<number | undefined>(undefined)

  const installNote = installMode === 'plugin' ? INSTALL.pluginNote : INSTALL.shNote

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard?.writeText(text).catch(() => {})
    setCopied(key)
    window.clearTimeout(copyTimer.current)
    copyTimer.current = window.setTimeout(() => setCopied(''), 1600)
  }, [])

  useEffect(() => () => window.clearTimeout(copyTimer.current), [])

  /* ---- §02 terminal ---- */
  const [step, setStep] = useState(0)
  const [hell, setHell] = useState(false)
  const [shear, setShear] = useState(false)
  const stepTimer = useRef<number | undefined>(undefined)
  const shearTimer = useRef<number | undefined>(undefined)

  const clearTimers = useCallback(() => {
    window.clearTimeout(stepTimer.current)
    window.clearTimeout(shearTimer.current)
  }, [])

  const advance = useCallback(
    (i: number) => {
      const line = SCRIPT[i]
      if (!line) {
        stepTimer.current = window.setTimeout(() => {
          setStep(0)
          setHell(false)
          stepTimer.current = window.setTimeout(() => advance(0), 420)
        }, 2800)
        return
      }
      setStep(i + 1)
      if (line.hell) {
        setHell(true)
        setShear(true)
        shearTimer.current = window.setTimeout(() => setShear(false), 300)
      }
      stepTimer.current = window.setTimeout(() => advance(i + 1), line.d)
    },
    [],
  )

  const replay = useCallback(() => {
    clearTimers()
    setStep(0)
    setHell(false)
    setShear(false)
    if (prefersReducedMotion()) {
      setStep(SCRIPT.length)
      setHell(true)
      return
    }
    stepTimer.current = window.setTimeout(() => advance(0), 420)
  }, [advance, clearTimers])

  const jumpHell = useCallback(() => {
    clearTimers()
    setStep(HELL_INDEX + 1)
    setHell(true)
    if (!prefersReducedMotion()) {
      setShear(true)
      shearTimer.current = window.setTimeout(() => setShear(false), 300)
      stepTimer.current = window.setTimeout(() => advance(HELL_INDEX + 1), 480)
    } else {
      setStep(SCRIPT.length)
    }
  }, [advance, clearTimers])

  useEffect(() => {
    replay()
    return clearTimers
  }, [replay, clearTimers])

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

        {/* blade divider — the alpha-verified katana pack */}
        <div className="lp-blade">
          <span className="lp-band lp-blade__band" aria-hidden="true">
            <img src={katanaHeaven} alt="" />
          </span>
          <span className="lp-blade__plate" aria-hidden="true">
            PLATE NO. 001
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ 01 */}
      <section className="lp-section" id="doors">
        <SectionHead n="01" title="SAME HARNESS, ZERO BLOAT." />

        <div className="sh-note lp-ann">
          <span className="lp-ann__mark" aria-hidden="true">
            ▸
          </span>
          <span>
            MARKS · four tiles carry the harness’s own mark — Claude (Simple Icons, CC0), pi
            (pi.dev), Codex (OpenAI) and Grok (xAI). Nous Research publishes no vector mark for
            Hermes, so that tile carries a lettermark in our own type rather than an invented logo.
            Default selection is <b>{DOORS[0].pkg}</b>.
          </span>
        </div>

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
                {DOOR_MARKS[d.id] ? (
                  <svg className="lp-door__mark" viewBox={DOOR_MARKS[d.id].viewBox} aria-hidden="true">
                    <path
                      d={DOOR_MARKS[d.id].d}
                      fillRule={DOOR_MARKS[d.id].evenOdd ? 'evenodd' : undefined}
                    />
                  </svg>
                ) : (
                  <span className="lp-door__mark lp-door__mark--letter" aria-hidden="true">
                    {d.harness.slice(0, 1)}
                  </span>
                )}
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
              <span className="sh-label">INSTALL</span>
              <div className="lp-seg" role="group" aria-label="Install route">
                <button
                  type="button"
                  className={`lp-seg__btn${installMode === 'plugin' ? ' is-on' : ''}`}
                  aria-pressed={installMode === 'plugin'}
                  onClick={() => setInstallMode('plugin')}
                >
                  the plugin (Claude Code)
                </button>
                <button
                  type="button"
                  className={`lp-seg__btn${installMode === 'sh' ? ' is-on' : ''}`}
                  aria-pressed={installMode === 'sh'}
                  onClick={() => setInstallMode('sh')}
                >
                  the launcher doors (shell)
                </button>
              </div>
            </div>
            {installMode === 'plugin' ? (
              <div className="lp-install__lines">
                {INSTALL.plugin.map((line, i) => (
                  <CommandBlock
                    key={line}
                    cmd={line}
                    sigil="›"
                    tone={i === 0 ? 'violet' : 'mint'}
                    copied={copied === `install-${i}`}
                    onCopy={() => copy(line, `install-${i}`)}
                    label={`install command, line ${i + 1} of ${INSTALL.plugin.length}`}
                  />
                ))}
              </div>
            ) : (
              <CommandBlock
                cmd={INSTALL.sh}
                sigil="$"
                tone="mint"
                copied={copied === 'install'}
                onCopy={() => copy(INSTALL.sh, 'install')}
                label="install command"
              />
            )}
            <p className="lp-install__note">{installNote}</p>
          </div>

          <div className="lp-install__panel lp-install__panel--launch sh-panel">
            <div className="sh-label">
              {installMode === 'plugin' ? 'THEN, IN THE SESSION' : 'HOW TO LAUNCH'}
            </div>
            {installMode === 'plugin' ? (
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
                  Nothing to launch. The plugin puts five commands in the session you are
                  already in — <code>/summon</code>, <code>/skill-zero</code>,{' '}
                  <code>/skill-heaven</code>, <code>/skill-hell</code>,{' '}
                  <code>/skill-ultra</code> — and the summon engine ships inside it.
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
          WORK IN PROGRESS · v0 — the plugin installs from this repository’s own marketplace; the
          five launcher doors are source-delivered through <code>install.sh</code>. Neither is on
          npm. Uninstall is one script: <code>{INSTALL.uninstall}</code>
        </p>
      </section>

      {/* ------------------------------------------------------------------ 02 */}
      <section className="lp-section" id="run">
        <SectionHead n="02" title="DEMO" />
        <p className="lp-section__lede">
          Launch with <code>{DOORS[0].launch}</code>. <code>{MECHANIC.floor}</code> a single skill.
          <code>/skill-hell</code> auto-summons agentic skills for you.
        </p>

        <div className="lp-term__controls">
          <button type="button" className="lp-ghost" onClick={replay}>
            ↻ REPLAY
          </button>
          <button type="button" className="lp-ghost lp-ghost--hell" onClick={jumpHell}>
            ↯ JUMP TO /skill-hell
          </button>
        </div>

        <div
          className={`lp-term${hell ? ' is-hell' : ''}${shear ? ' is-shearing' : ''}`}
          role="img"
          aria-label="Simulated terminal session: claude-zero composes flags and execs, /summon borrows one skill for the session, /skill-hell arms the explore ladder at rung high."
        >
          <span className="lp-term__c lp-term__c--tl" aria-hidden="true" />
          <span className="lp-term__c lp-term__c--tr" aria-hidden="true" />
          <span className="lp-term__c lp-term__c--bl" aria-hidden="true" />
          <span className="lp-term__c lp-term__c--br" aria-hidden="true" />
          <div className="lp-term__bar">
            <span>╭─ ~/gaia-skill-tree — {picked.pkg}</span>
            <span className="lp-term__state">{hell ? 'HELL · EXPLORE' : 'HEAVEN · CONVERGE'} ─╮</span>
          </div>
          <div className="lp-term__body">
            {SCRIPT.slice(0, step).map((l, i) => (
              <div className="lp-term__row" key={i}>
                <span className="lp-term__gut" aria-hidden="true">
                  │
                </span>
                <span className={`lp-term__glyph lp-k-${l.k}`} aria-hidden="true">
                  {l.g}
                </span>
                <span className={`lp-term__text lp-k-${l.k}`}>{l.t}</span>
              </div>
            ))}
            <div className="lp-term__row">
              <span className="lp-term__gut" aria-hidden="true">
                │
              </span>
              <span className="lp-term__glyph" aria-hidden="true">
                ›
              </span>
              <span className="lp-term__caret" aria-hidden="true" />
            </div>
          </div>
          <div className="lp-term__bar lp-term__bar--foot">
            <span>╰─ INSERT · UTF-8</span>
            <span>{picked.pkg} ─╯</span>
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

        {/* the floor */}
        <div className="lp-floor">
          <div className="lp-floor__cmd">
            <span aria-hidden="true">›</span>
            <code>{MECHANIC.floor}</code>
            <span className="sh-chip sh-chip--live">THE FLOOR</span>
          </div>
          <div className="lp-floor__prose">
            <p>{MECHANIC.line}</p>
            <p className="lp-floor__note">{MECHANIC.floorNote}</p>
          </div>
        </div>

        {/* four surfaces */}
        <div className="lp-surfaces">
          {SURFACES.map((s) => (
            <article className={`lp-surface lp-surface--${s.id}`} key={s.id}>
              <img className="lp-surface__icon" src={SURFACE_ICON[s.id]} alt="" aria-hidden="true" />
              <h3 className="lp-surface__cmd">{s.command}</h3>
              <div className="lp-surface__role">{s.role}</div>
              <p className="lp-surface__blurb">{s.blurb}</p>
              <div className="lp-surface__foot">
                {s.id === 'heaven' ? (
                  <>
                    <span className="sh-label">BAND · low · med · opens low</span>
                    <span className="sh-chip sh-chip--wip">WIP</span>
                  </>
                ) : s.id === 'hell' ? (
                  <>
                    <span className="sh-label">BAND · high · xhigh · max · opens high</span>
                    <span className="sh-chip sh-chip--wip">WIP</span>
                  </>
                ) : s.id === 'ultra' ? (
                  <span className="sh-label">ULTRA · the crown of the line</span>
                ) : (
                  <span className="sh-label">ZERO · the floor of the line</span>
                )}
              </div>
            </article>
          ))}
        </div>

        {/* the four-band decision ledger */}
        <div className="lp-ledger lp-ledger--four">
          {[
            {
              cmd: '/skill-zero',
              glyph: '○',
              kcls: 'lp-k-grey',
              rows: ['benchmarking', 'clean slate', 'everything vanilla', 'removing skill bloat'],
            },
            {
              cmd: '/skill-heaven',
              glyph: '◆',
              kcls: 'lp-k-violet',
              rows: ['brainstorming', 'grilling sessions', 'iterating', 'human-in-the-loop'],
            },
            {
              cmd: '/skill-hell',
              glyph: '◈',
              kcls: 'lp-k-amber',
              wip: true,
              rows: ['exploring options', 'yolo-ing', 'let the expert decide', 'full agentic autonomy'],
            },
            {
              cmd: '/skill-ultra',
              glyph: '✦',
              kcls: 'lp-k-gold',
              wip: true,
              rows: ['controlled autonomy', 'no dial to set', 'maximize quality', 'fully equipped agent'],
            },
          ].map((col) => (
            <div className="lp-ledger__col" key={col.cmd}>
              <div className="lp-ledger__head">
                <span className={`lp-ledger__glyph ${col.kcls}`} aria-hidden="true">
                  {col.glyph}
                </span>
                <h3>REACH FOR {col.cmd.toUpperCase()}</h3>
                {col.wip ? <span className="sh-chip sh-chip--wip">WIP</span> : null}
              </div>
              <ul className="lp-ledger__rows">
                {col.rows.map((row, i) => (
                  <li key={i}>
                    <span className={col.kcls} aria-hidden="true">
                      →
                    </span>
                    <span>{row}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
