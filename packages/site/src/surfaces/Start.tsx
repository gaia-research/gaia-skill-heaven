/**
 * /start — install & onboarding (docs/CONTROL-PLANE.md §1 and §5.4).
 *
 * Mode: Operate. A task page: pick the harness you already use, get that
 * harness's exact path, know what changed on the machine, how to update and
 * how to remove it. Every harness fact is RENDERED from the compat table in
 * @gaia-skill-heaven/status (HARNESS_PATHS) — nothing about a harness is
 * hard-coded here, so the page cannot print a command the tool would reject.
 *
 * State: the selected harness lives in the URL hash query (`#/start?h=codex`)
 * so a link is shareable. Nothing else is persisted.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  AGENT_PLUGIN_INSTALL,
  CHIP_LABEL,
  CHIP_MEANING,
  HARNESS_PATHS,
  LAUNCHER_INSTALL,
  type HarnessPath,
  type VerificationChip,
} from '@gaia-skill-heaven/status'
import { EVENT_FIXTURES, STATUS_FIXTURES } from '@gaia-skill-heaven/status/fixtures'
import { EventPulse, StatusLine } from '../instrument/StatusLine'
import { PlatformToggle } from '../components/PlatformToggle'
import { LADDER_WIP, MECHANIC, SITE, type Platform } from '../product'
import '../styles/system.css'
import './start.css'

/** The URL value for "I don't have one yet". */
const NONE = 'none'

const SIGIL: Record<Platform, string> = { posix: '$', windows: '>' }

/* -------------------------------------------------------------------------
   small parts
   ------------------------------------------------------------------------- */

/** Verification chip: a drawn glyph AND the word — never colour alone. */
function ChipGlyph({ chip }: { chip: VerificationChip }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 14 14',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    'aria-hidden': true,
    focusable: false,
    className: 'st-chip__glyph',
  } as const
  switch (chip) {
    case 'verified':
      // ringed check
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.75" />
          <path d="M4.2 7.2 6.3 9.3 9.9 5" />
        </svg>
      )
    case 'compatible':
      // ring, right half filled
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.75" />
          <path d="M7 1.25a5.75 5.75 0 0 1 0 11.5Z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'partial':
      // ring, one quadrant filled
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.75" />
          <path d="M7 7V1.25A5.75 5.75 0 0 1 12.75 7Z" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'unverified':
      // dashed ring, empty
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="5.75" strokeDasharray="2.2 2.2" />
        </svg>
      )
    case 'needs-local-probe':
      // diamond with a point
      return (
        <svg {...common}>
          <path d="M7 1.2 12.8 7 7 12.8 1.2 7Z" />
          <circle cx="7" cy="7" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}

function Chip({ chip }: { chip: VerificationChip }) {
  return (
    <span className={`st-chip st-chip--${chip}`}>
      <ChipGlyph chip={chip} />
      <span>{CHIP_LABEL[chip]}</span>
    </span>
  )
}

function Command({
  cmd,
  sigil,
  label,
  copied,
  onCopy,
}: {
  cmd: string
  sigil: string
  label: string
  copied: boolean
  onCopy: (cmd: string) => void
}) {
  return (
    <div className="st-cmd">
      <span className="st-cmd__sigil" aria-hidden="true">
        {sigil}
      </span>
      <code className="st-cmd__code">{cmd}</code>
      <button type="button" className="st-cmd__copy" onClick={() => onCopy(cmd)}>
        {copied ? 'Copied' : 'Copy'}
        <span className="sr-only">{` ${label}`}</span>
      </button>
    </div>
  )
}

/** A line is a command (render as code) when it starts with the harness's own binary. */
function looksLikeCommand(line: string, h: HarnessPath): boolean {
  return h.bin !== null && line.startsWith(`${h.bin} `)
}

/* -------------------------------------------------------------------------
   the page
   ------------------------------------------------------------------------- */

export default function Start() {
  const [params, setParams] = useSearchParams()
  const [platform, setPlatform] = useState<Platform>('posix')
  const [copiedCmd, setCopiedCmd] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const rawChoice = params.get('h')
  const choice =
    rawChoice === NONE || HARNESS_PATHS.some((h) => h.id === rawChoice) ? rawChoice : null
  const harness = HARNESS_PATHS.find((h) => h.id === choice) ?? null

  const select = useCallback(
    (value: string) => {
      setParams({ h: value }, { replace: true })
    },
    [setParams],
  )

  const copy = useCallback((cmd: string) => {
    // Clipboard can be absent or refused (insecure context, permissions).
    // The command stays selectable on screen either way.
    try {
      void navigator.clipboard?.writeText(cmd).catch(() => {})
    } catch {
      /* selectable text is the fallback */
    }
    setCopiedCmd(cmd)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopiedCmd(''), 1600)
  }, [])

  useEffect(() => () => window.clearTimeout(timer.current), [])

  useEffect(() => {
    const before = document.title
    document.title = 'Install Skill Heaven'
    return () => {
      document.title = before
    }
  }, [])

  const installer = platform === 'windows' ? AGENT_PLUGIN_INSTALL.windows : AGENT_PLUGIN_INSTALL.posix
  const launcherInstall = platform === 'windows' ? LAUNCHER_INSTALL.windows : LAUNCHER_INSTALL.posix
  const sigil = SIGIL[platform]

  const announce = harness
    ? `Showing the path for ${harness.name}.`
    : choice === NONE
      ? 'Showing what to do without a harness.'
      : ''

  return (
    <div className="st">
      <a className="st-skip" href="#st-main" onClick={(e) => skipToMain(e)}>
        Skip to the install
      </a>
      <header className="st-bar">
        <nav className="st-bar__in" aria-label="Primary">
          <Link className="st-bar__back" to="/">
            <span aria-hidden="true">←</span> The door
          </Link>
          <span className="st-bar__name">{SITE.repoName}</span>
          <span className="st-bar__links">
            <Link to="/landing">Document</Link>
            <Link to="/live">Production update</Link>
          </span>
        </nav>
      </header>

      <main id="st-main" className="st-main" tabIndex={-1}>
        <div className="st-head">
          <h1 className="st-h1">Install Skill Heaven</h1>
          <p className="st-lede">
            Skill Heaven summons one skill into a session — nothing is installed permanently, and it
            is gone when the session ends. The <b>plugin</b> is what you install, inside a harness you
            already use. It never installs your harness.
          </p>
        </div>

        {/* ------------------------------------------------ which harness */}
        <section className="st-sec" aria-labelledby="st-which">
          <h2 className="st-h2" id="st-which">
            Which harness are you using?
          </h2>
          <p className="st-help" id="st-which-help">
            Choose one. Arrow keys move between options. Each shows how far its install has been
            verified.
          </p>
          <div className="st-opts" role="radiogroup" aria-labelledby="st-which" aria-describedby="st-which-help">
            {HARNESS_PATHS.map((h) => (
              <label key={h.id} className="st-opt">
                <input
                  type="radio"
                  name="harness"
                  value={h.id}
                  checked={choice === h.id}
                  onChange={() => select(h.id)}
                />
                <span className="st-opt__body">
                  <span className="st-opt__mark" aria-hidden="true" />
                  <span className="st-opt__name">{h.name}</span>
                  <Chip chip={h.chip} />
                  <span className="st-opt__ver">
                    {h.probedVersion ? `probed on ${h.probedVersion}` : 'not probed'}
                  </span>
                </span>
              </label>
            ))}
            <label className="st-opt st-opt--none">
              <input
                type="radio"
                name="harness"
                value={NONE}
                checked={choice === NONE}
                onChange={() => select(NONE)}
              />
              <span className="st-opt__body">
                <span className="st-opt__mark" aria-hidden="true" />
                <span className="st-opt__name">I don’t have one yet</span>
                <span className="st-opt__ver">nothing to verify</span>
              </span>
            </label>
          </div>
          <p className="sr-only" role="status" aria-live="polite">
            {announce}
          </p>
        </section>

        {/* ------------------------------------------------- your path */}
        {!choice && (
          <section className="st-sec st-empty" aria-labelledby="st-path-empty">
            <h2 className="st-h2" id="st-path-empty">
              Your path
            </h2>
            <p className="st-prose">
              Pick a harness above and its exact steps appear here — with the evidence behind them.
              Claude Code is listed first because it is the one path verified end to end from a fresh
              install.
            </p>
          </section>
        )}

        {choice === NONE && <NoHarness onPick={select} />}

        {harness && (
          <>
            <section className="st-sec" aria-labelledby="st-path">
              <h2 className="st-h2" id="st-path">
                Your path: {harness.name}
              </h2>

              <div className="st-evidence">
                <Chip chip={harness.chip} />
                <p className="st-evidence__text">
                  {CHIP_MEANING[harness.chip]}
                  {harness.probedVersion && (
                    <>
                      {' '}
                      Probed on {harness.name} <span className="st-mono">{harness.probedVersion}</span>.
                    </>
                  )}
                </p>
                <p className="st-evidence__text st-evidence__text--dim">
                  {harness.evidence}
                  {harness.evidenceHref && (
                    <>
                      {' '}
                      <a href={harness.evidenceHref} target="_blank" rel="noreferrer noopener">
                        Evidence<span className="sr-only"> (opens in a new tab)</span>
                        <span aria-hidden="true"> ↗</span>
                      </a>
                    </>
                  )}
                </p>
              </div>

              <ol className="st-steps">
                {showInstaller(harness) && (
                  <li className="st-step">
                    <div className="st-step__head">
                      <h3 className="st-h3">
                        {harness.commands.length > 0 ? 'Put the plugin on disk' : 'Put the portable package on disk'}
                      </h3>
                      <PlatformToggle platform={platform} onToggle={setPlatform} />
                    </div>
                    <p className="st-prose">
                      In a terminal. Needs Node 22+ and Git. It installs one plugin directory and a
                      local marketplace, prints both paths, and registers nothing — {harness.name} keeps
                      its own registration, which is the next step.
                    </p>
                    <Command
                      cmd={installer}
                      sigil={sigil}
                      label="the Agent Plugin installer command"
                      copied={copiedCmd === installer}
                      onCopy={copy}
                    />
                  </li>
                )}

                {harness.commands.length > 0 && (
                  <li className="st-step">
                    <h3 className="st-h3">
                      {harness.inHarness ? `Type these inside ${harness.name}` : `Register it in ${harness.name}`}
                    </h3>
                    <p className="st-prose">
                      {harness.inHarness
                        ? `No terminal needed — these are ${harness.name} commands, typed at its prompt. Two lines, in order.`
                        : `In a terminal, after the installer. ${harness.name} copies or caches the plugin the way it does for any plugin.`}
                    </p>
                    <div className="st-cmds">
                      {harness.commands.map((c, i) => (
                        <Command
                          key={c}
                          cmd={c}
                          sigil={harness.inHarness ? '›' : sigil}
                          label={`${harness.name} command, line ${i + 1} of ${harness.commands.length}`}
                          copied={copiedCmd === c}
                          onCopy={copy}
                        />
                      ))}
                    </div>
                  </li>
                )}

                {harness.commands.length === 0 && harness.blocked && (
                  <li className="st-step st-step--plain">
                    <div className="st-blocked" role="note">
                      <h3 className="st-h3">No registration command yet</h3>
                      <p className="st-blocked__text">{harness.blocked}</p>
                    </div>
                  </li>
                )}

                {harness.id === 'claude' && (
                  <li className="st-step st-step--optional">
                    <div className="st-step__head">
                      <h3 className="st-h3">Optional: the console</h3>
                      <span className="sh-chip sh-chip--wip st-preview">Preview</span>
                    </div>
                    <p className="st-prose">
                      Adds a status entry, the Lens band and the <span className="st-mono">/heaven</span>{' '}
                      console. It observes; it never changes what Skill Heaven does. Skip it and nothing
                      is missing.
                    </p>
                    <Command
                      cmd="/plugin install skill-heaven-console@gaia-skill-heaven"
                      sigil="›"
                      label="the optional console install command"
                      copied={copiedCmd === '/plugin install skill-heaven-console@gaia-skill-heaven'}
                      onCopy={copy}
                    />
                  </li>
                )}
              </ol>

              <p className="st-status-note">
                <span className="st-label">Status line on {harness.name}</span>
                <span>{harness.statusNote}</span>
              </p>
            </section>

            <section className="st-sec" aria-labelledby="st-changes">
              <h2 className="st-h2" id="st-changes">
                What changes on your machine
              </h2>
              <dl className="st-ledger">
                <div className="st-ledger__row">
                  <dt>Writes</dt>
                  <dd>
                    {harness.needsInstaller ? (
                      <>
                        One directory, <code className="st-code">{AGENT_PLUGIN_INSTALL.root}</code>, holding
                        the plugin and a local marketplace. {harness.commands.length > 0 && (
                          <>
                            Then {harness.name}’s own registration copies or caches the plugin, the way{' '}
                            {harness.name} does for any plugin.
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        Only what {harness.name} itself does for any plugin: it caches the plugin in its own
                        plugin store and records it as installed. Skill Heaven adds nothing else.
                      </>
                    )}
                  </dd>
                </div>
                <div className="st-ledger__row">
                  <dt>Leaves alone</dt>
                  <dd>
                    {harness.needsInstaller
                      ? `Your ${harness.name} configuration, your shell profile and your repository. The installer does not touch them.`
                      : `Your settings, your skills and your repository. The plugin is added; nothing of yours is edited.`}
                  </dd>
                </div>
                <div className="st-ledger__row">
                  <dt>Update</dt>
                  <dd>
                    {looksLikeCommand(harness.update, harness) ? (
                      <Command
                        cmd={harness.update}
                        sigil={sigil}
                        label={`${harness.name} update command`}
                        copied={copiedCmd === harness.update}
                        onCopy={copy}
                      />
                    ) : (
                      harness.update
                    )}
                  </dd>
                </div>
                <div className="st-ledger__row">
                  <dt>Remove</dt>
                  <dd>
                    <div className="st-cmds">
                      {harness.remove.map((r) => {
                        const isLocal = r === AGENT_PLUGIN_INSTALL.uninstall
                        return (
                          <div key={r} className="st-remove">
                            <span className="st-remove__label">
                              {isLocal ? 'Remove the local artifact' : `Unregister from ${harness.name}`}
                            </span>
                            <Command
                              cmd={r}
                              sigil={sigil}
                              label={isLocal ? 'the local uninstall script' : `${harness.name} remove command`}
                              copied={copiedCmd === r}
                              onCopy={copy}
                            />
                          </div>
                        )
                      })}
                    </div>
                    {harness.needsInstaller && (
                      <p className="st-caveat">
                        Removing the local artifact does not unregister copies {harness.name} already holds.
                        {harness.remove.length > 1 ? ' Unregister first, then remove the artifact.' : ''}
                      </p>
                    )}
                  </dd>
                </div>
              </dl>
            </section>
          </>
        )}

        {/* ------------------------------------------------- first run */}
        <section className="st-sec" aria-labelledby="st-first">
          <h2 className="st-h2" id="st-first">
            First run
          </h2>
          <p className="st-prose st-prose--lead">
            In any session, type <code className="st-code st-code--cmd">/summon &lt;what you need&gt;</code>.{' '}
            {MECHANIC.line}
          </p>

          <figure className="st-fig">
            <div className="st-fig__stage">
              <EventPulse event={EVENT_FIXTURES.manual!.event} />
              <div className="st-fig__line">
                <StatusLine status={STATUS_FIXTURES.fresh!.status} mode="compact" />
              </div>
            </div>
            <figcaption className="st-fig__cap">
              <b>Example — not your session.</b> A summon returns a card naming the skill, where it came
              from and why it matched. The pulse and the status entry above come from the optional
              console. Fixture data, drawn by the same renderer the console uses.
            </figcaption>
          </figure>

          <h3 className="st-h3 st-h3--spaced">Then set how widely it reaches</h3>
          <ul className="st-rungs">
            <li>
              <code className="st-code st-code--cmd">/skill-zero</code>
              <span>the floor — cut the skills you summoned</span>
            </li>
            <li>
              <code className="st-code st-code--cmd">/skill-heaven [low|med]</code>
              <span>converge — summon narrowly onto the gap in front of you</span>
            </li>
            <li>
              <code className="st-code st-code--cmd">/skill-hell [high|xhigh|max]</code>
              <span>explore — summon widely around the gap</span>
            </li>
            <li>
              <code className="st-code st-code--cmd">/skill-ultra</code>
              <span>provisioned — the controller that would choose for you is not built yet</span>
            </li>
          </ul>
          <p className="st-caveat">
            <span className="sh-chip sh-chip--wip st-preview">Provisional</span> {LADDER_WIP}
          </p>
        </section>

        {/* ------------------------------------------------- launcher */}
        <section className="st-sec" aria-labelledby="st-launcher">
          <h2 className="st-h2" id="st-launcher">
            Do I need a launcher?
          </h2>
          <p className="st-answer">No.</p>
          <p className="st-prose">
            The plugin works in any session you already have. A launcher is an optional extra: it starts
            your harness at the Skill Zero floor — nothing loaded but <span className="st-mono">/summon</span> —
            by composing flags and exec’ing the harness. It never installs a harness and never edits your
            configuration.
          </p>
          <ul className="st-launchers">
            {HARNESS_PATHS.filter((h) => h.launcher).map((h) => (
              <li key={h.id} className={harness?.id === h.id ? 'is-on' : undefined}>
                <code className="st-code">{h.launcher}</code>
                <span>{h.name}</span>
              </li>
            ))}
          </ul>
          {harness?.launcher && (
            <p className="st-prose">
              For {harness.name}: <code className="st-code">{harness.launcher}</code>.
            </p>
          )}
          <div className="st-step__head st-step__head--plain">
            <span className="st-label">Install the launchers</span>
            <PlatformToggle platform={platform} onToggle={setPlatform} />
          </div>
          <Command
            cmd={launcherInstall}
            sigil={sigil}
            label="the launcher install command"
            copied={copiedCmd === launcherInstall}
            onCopy={copy}
          />
          <p className="st-caveat">
            Remove: <code className="st-code">{LAUNCHER_INSTALL.uninstall}</code>
          </p>
        </section>
      </main>

      <footer className="st-foot">
        <nav className="st-foot__in" aria-label="More">
          <Link to="/live">The receipt — what shipped, and what is still provisional</Link>
          <Link to="/console">The console prototype (fixture data)</Link>
          <a href={SITE.repoUrl} target="_blank" rel="noreferrer noopener">
            Repository<span className="sr-only"> (opens in a new tab)</span>
            <span aria-hidden="true"> ↗</span>
          </a>
        </nav>
      </footer>
    </div>
  )
}

/**
 * Show the installer when the path needs it AND there is something to do with
 * the result: a registration command exists, or the row's own text points the
 * reader at the installed directory. (A row with neither — a probed-and-failed
 * harness — shows its `blocked` text alone; installing would strand the files.)
 */
function showInstaller(h: HarnessPath): boolean {
  if (!h.needsInstaller) return false
  if (h.commands.length > 0) return true
  return h.blocked !== null && h.blocked.includes(AGENT_PLUGIN_INSTALL.plugin)
}

function NoHarness({ onPick }: { onPick: (id: string) => void }) {
  const names = HARNESS_PATHS.filter((h) => h.bin !== null)
  const claude = HARNESS_PATHS.find((h) => h.id === 'claude')
  return (
    <section className="st-sec" aria-labelledby="st-none">
      <h2 className="st-h2" id="st-none">
        No harness yet
      </h2>
      <p className="st-prose st-prose--lead">
        Skill Heaven does not install harnesses. It works inside one you already use, so there is nothing
        to install here yet — and nothing on your machine has changed.
      </p>
      <p className="st-prose">
        The harnesses this page has a path for: {names.map((h) => h.name).join(', ')}, and any other
        Agent Plugins client.
      </p>
      {claude && (
        <>
          <p className="st-prose">
            If you are choosing one to start with, {claude.name} is the verified path — a fresh install
            checked end to end, with no terminal step.
          </p>
          <button type="button" className="sh-cta st-btn" onClick={() => onPick(claude.id)}>
            Show the {claude.name} path <span aria-hidden="true">→</span>
          </button>
        </>
      )}
    </section>
  )
}

function skipToMain(e: MouseEvent<HTMLAnchorElement>) {
  // A bare `#st-main` would be read as a route by the HashRouter.
  e.preventDefault()
  const el = document.getElementById('st-main')
  el?.focus()
  el?.scrollIntoView()
}
