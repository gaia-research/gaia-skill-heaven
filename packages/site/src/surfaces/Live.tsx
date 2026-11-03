import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { INSTALL, SITE } from '../product'
import { NOT_CLAIMED, RECEIPT, RELEASE, SHIPPED } from '../release'
import '../styles/system.css'
import './live.css'
import brandLogo from '../assets/brand/skill-heaven-logo.png'

/**
 * `/live` — the production update page.
 *
 * Two columns of truth, kept visibly apart: what is LIVE (the tool, with a
 * receipt) and what stays PROVISIONAL (the research). A reader should be able to
 * trust the first list precisely because the second one is written as plainly.
 * All content lives in `release.ts` and `product.ts`; this file invents nothing.
 */
export default function Live() {
  useEffect(() => {
    const previous = document.title
    document.title = 'Skill Heaven is live — production update'
    window.scrollTo(0, 0)
    return () => {
      document.title = previous
    }
  }, [])

  const shortCommit = RECEIPT.commit.slice(0, 7)
  const commitUrl = `${SITE.repoUrl}/commit/${RECEIPT.commit}`

  return (
    <div className="lv">
      <a className="lv-skip" href="#shipped">
        Skip to what shipped
      </a>

      <nav className="lv-nav" aria-label="Primary">
        <div className="lv-nav__brand">
          <Link className="lv-nav__back" to="/landing" aria-label="Back to the site">
            <span aria-hidden="true">←</span> THE SITE
          </Link>
          <img className="lv-nav__logo" src={brandLogo} alt="" aria-hidden="true" />
          <span className="lv-nav__name">{SITE.repoName}</span>
          <span className="sh-chip sh-chip--live">{SITE.status}</span>
        </div>
        <div className="lv-nav__links">
          <a href="#shipped">SHIPPED</a>
          <a href="#receipt">RECEIPT</a>
          <a href="#provisional">PROVISIONAL</a>
          <a href="#install">INSTALL</a>
        </div>
      </nav>

      <main>
      <header className="lv-head">
        <div className="lv-kicker">
          <span className="lv-pulse" aria-hidden="true" />
          <span>PRODUCTION UPDATE</span>
          <span className="lv-kicker__rule" aria-hidden="true" />
          <span>
            v{RELEASE.pluginVersion} · {RELEASE.updated}
          </span>
        </div>
        <h1 className="lv-h1">Skill Heaven is live.</h1>
        <p className="lv-lede">
          Summon one skill into a session, with nothing installed — from a tool that installs cleanly
          from <code>main</code>, was checked end to end from a fresh install, and says in every
          result what it is and is not. This page lists what shipped, the receipt for it, and the
          research that is still open.
        </p>
        <div className="lv-split" role="group" aria-label="What is live and what is provisional">
          <div className="lv-split__col lv-split__col--live">
            <span className="sh-chip sh-chip--live">LIVE</span>
            <h2>The tool</h2>
            <p>
              Install, summon, the clean room, the bundled MCP, the security model and permission
              handling. Production-ready, and verified below.
            </p>
          </div>
          <div className="lv-split__col lv-split__col--prov">
            <span className="sh-chip sh-chip--wip">PROVISIONAL</span>
            <h2>The research</h2>
            <p>
              What each rung means in behaviour, and everything that waits on behavioural evidence
              that does not exist yet. Stated plainly <a href="#provisional">below</a>.
            </p>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ shipped */}
      <section className="lv-section" id="shipped" aria-labelledby="shipped-h">
        <div className="lv-shead">
          <span className="lv-shead__n">01</span>
          <span className="sh-rule lv-shead__rule" aria-hidden="true" />
          <h2 className="sh-h2" id="shipped-h">
            What shipped
          </h2>
        </div>
        <p className="lv-section__lede">
          Eleven things, each with the evidence that keeps its claim honest. Measured or verified
          claims only.
        </p>
        <ol className="lv-grid">
          {SHIPPED.map((item, index) => (
            <li className="lv-card" key={item.id}>
              <div className="lv-card__n" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </div>
              <h3 className="lv-card__title">{item.title}</h3>
              <p className="lv-card__claim">{item.claim}</p>
              <p className="lv-card__proof">
                <span className="lv-card__proof-tag">EVIDENCE</span> {item.proof}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------------------------------------ receipt */}
      <section className="lv-section" id="receipt" aria-labelledby="receipt-h">
        <div className="lv-shead">
          <span className="lv-shead__n">02</span>
          <span className="sh-rule lv-shead__rule" aria-hidden="true" />
          <h2 className="sh-h2" id="receipt-h">
            The clean-install receipt
          </h2>
        </div>
        <p className="lv-section__lede">
          A throwaway home and config directory, the public installer, GitHub <code>main</code> —
          then the installed plugin, the installed launcher and a live Claude Code session were
          checked. Reproduce it with{' '}
          <a href={RELEASE.links.script} target="_blank" rel="noreferrer">
            <code>node scripts/release-acceptance.mjs</code>
          </a>
          .
        </p>
        <dl className="lv-facts">
          <div>
            <dt>Result</dt>
            <dd>
              {RECEIPT.passed} of {RECEIPT.total} checks passed
            </dd>
          </div>
          <div>
            <dt>Installed commit</dt>
            <dd>
              <a href={commitUrl} target="_blank" rel="noreferrer">
                <code>{shortCommit}</code>
              </a>{' '}
              · GitHub main
            </dd>
          </div>
          <div>
            <dt>Claude Code</dt>
            <dd>{RECEIPT.claude} (pinned)</dd>
          </div>
          <div>
            <dt>Plugin</dt>
            <dd>skill-heaven {RECEIPT.pluginVersion}</dd>
          </div>
          <div>
            <dt>Live session model</dt>
            <dd>{RECEIPT.liveModel}</dd>
          </div>
          <div>
            <dt>Node · platform</dt>
            <dd>
              {RECEIPT.node} · {RECEIPT.platform}
            </dd>
          </div>
          <div>
            <dt>Run on</dt>
            <dd>{RECEIPT.date}</dd>
          </div>
        </dl>
        <div className="lv-receipt">
          {RECEIPT.groups.map((group) => (
            <div className="lv-receipt__group" key={group.title}>
              <h3>{group.title}</h3>
              <ul>
                {group.items.map((item) => (
                  <li key={item}>
                    <span className="lv-tick" aria-hidden="true">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="lv-fineprint">
          The live sessions ran under the operator’s own login (a throwaway config directory is
          logged out), reading settings read-only against the freshly installed plugin; the
          operator’s settings and plugin registries were byte-identical afterwards. Program record:{' '}
          <a href={RELEASE.links.program} target="_blank" rel="noreferrer">
            #116
          </a>
          . Acceptance:{' '}
          <a href={RELEASE.links.acceptance} target="_blank" rel="noreferrer">
            #172
          </a>
          .
        </p>
      </section>

      {/* -------------------------------------------------------- provisional */}
      <section className="lv-section" id="provisional" aria-labelledby="prov-h">
        <div className="lv-shead">
          <span className="lv-shead__n">03</span>
          <span className="sh-rule lv-shead__rule" aria-hidden="true" />
          <h2 className="sh-h2" id="prov-h">
            What this page does not claim
          </h2>
        </div>
        <p className="lv-section__lede">
          Live does not mean every research question is settled. These stay provisional, and they are
          disclosed in the product itself, not only here.
        </p>
        <ul className="lv-prov">
          {NOT_CLAIMED.map((item) => (
            <li key={item.id}>
              <span className="sh-chip sh-chip--wip">PROVISIONAL</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="lv-fineprint">
          Research that continues: the HH result payload, continuous-score survival and compaction —{' '}
          <a href={RELEASE.links.research} target="_blank" rel="noreferrer">
            gaia-research#207
          </a>
          ; the MCP standards tracker —{' '}
          <a href={RELEASE.links.standards} target="_blank" rel="noreferrer">
            #120
          </a>
          .
        </p>
      </section>

      {/* ------------------------------------------------------------ install */}
      <section className="lv-section" id="install" aria-labelledby="install-h">
        <div className="lv-shead">
          <span className="lv-shead__n">04</span>
          <span className="sh-rule lv-shead__rule" aria-hidden="true" />
          <h2 className="sh-h2" id="install-h">
            Install
          </h2>
        </div>
        <div className="lv-install">
          <div className="lv-install__block">
            <span className="sh-label">PORTABLE AGENT PLUGIN</span>
            <pre>
              <code>{INSTALL.agentPlugin.command}</code>
            </pre>
            <p>
              Puts one plugin and one local marketplace on disk and prints both paths. Your harness
              registers it with its own command; nothing in your configuration is edited for you.
            </p>
          </div>
          <div className="lv-install__block">
            <span className="sh-label">
              CLAUDE CODE MARKETPLACE · TESTED ON {INSTALL.claudeMarketplace.testedVersion}
            </span>
            <pre>
              <code>{INSTALL.claudeMarketplace.commands.join('\n')}</code>
            </pre>
            <p>Five commands: /summon, /skill-zero, /skill-heaven, /skill-hell, /skill-ultra.</p>
          </div>
          <div className="lv-install__block">
            <span className="sh-label">LAUNCHERS · claude-zero IS THE VERIFIED DOOR</span>
            <pre>
              <code>{INSTALL.sh}</code>
            </pre>
            <p>
              Installs the standalone <code>*-zero</code> launchers. It never installs a harness. The
              other doors are launcher prototypes with narrower evidence.
            </p>
          </div>
        </div>
        <p className="lv-fineprint">
          Free. Not on npm. Windows: <code>{INSTALL.agentPluginPs1.command}</code>
        </p>
      </section>

      </main>

      <footer className="lv-foot">
        <div className="lv-foot__bar">
          <span>
            {SITE.status} · v{RELEASE.pluginVersion} · PORTABLE AGENT PLUGIN · TESTED ON CLAUDE CODE{' '}
            {RECEIPT.claude}
          </span>
          <span className="lv-foot__links">
            <Link to="/landing">THE SITE</Link>
            <a href={SITE.repoUrl} target="_blank" rel="noreferrer">
              GITHUB ↗
            </a>
            <a href={SITE.issuesUrl} target="_blank" rel="noreferrer">
              ISSUES ↗
            </a>
          </span>
        </div>
      </footer>
    </div>
  )
}
