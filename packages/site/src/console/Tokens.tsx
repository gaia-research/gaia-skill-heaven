import { GROUND_HEX, ROLE_COLORS, type Role } from '@gaia-skill-heaven/status'
import { contrastRatio, gradeContrast } from './contrast'
import { Scroller } from './Pieces'

const MEANING: Readonly<Record<Exclude<Role, 'arbor'>, string>> = {
  umbrella: '◇ and the word “entropy”; focus ring; interactive',
  ultra: '◆ and ULTRA; controller fields — a controller, not prestige',
  zero: 'ZERO, the floor',
  heaven: '‹‹ and converge',
  hell: '›› and explore — never red',
  ink: 'primary values',
  dim: 'separators, labels, secondary values',
  stop: 'real failure or a policy stop only — never Hell',
  amber: 'FIXTURE · PREVIEW · PROVISIONAL · stale',
}

/** Arbor green is a reserved role. Nothing is Arbor-informed today, so it is
 * listed in prose below the table and never drawn. */
const DRAWN = (Object.keys(MEANING) as Array<Exclude<Role, 'arbor'>>).filter((r) => r in ROLE_COLORS)

export function TokensSection() {
  return (
    <section id="tokens" className="cx-sec" aria-labelledby="h-tokens">
      <h2 id="h-tokens">Tokens</h2>
      <p className="cx-lede">
        One set of roles for the site, the desktop console and the terminal. The renderer emits roles, not colours; each
        projection paints a role in its own medium. Contrast is computed here against the ground{' '}
        <code>{GROUND_HEX}</code>. Colour never carries meaning alone: every state also has a glyph and a word.
      </p>
      <Scroller label="Instrument colour roles with hex, ANSI-256 code, meaning and computed contrast" className="cx-tablewrap">
        <table className="cx-table cx-table--tokens">
          <caption className="sr-only">Instrument colour roles</caption>
          <thead>
            <tr>
              <th scope="col">Role</th>
              <th scope="col">Swatch</th>
              <th scope="col">Hex</th>
              <th scope="col">ANSI-256</th>
              <th scope="col">Meaning</th>
              <th scope="col">Contrast on ground</th>
            </tr>
          </thead>
          <tbody>
            {DRAWN.map((role) => {
              const c = ROLE_COLORS[role]
              const ratio = contrastRatio(c.hex, GROUND_HEX)
              const grade = role === 'stop' ? 'glyph-only' : gradeContrast(ratio)
              return (
                <tr key={role}>
                  <th scope="row">
                    {role}
                    <span className="cx-key cx-key--block">{c.cssVar}</span>
                  </th>
                  <td>
                    <span className="cx-sw" style={{ background: c.hex }} aria-hidden="true" />
                    <span className="cx-sample" style={{ color: c.hex }} aria-hidden="true">
                      {role === 'stop' ? '!' : 'Aa'}
                    </span>
                  </td>
                  <td>
                    <code>{c.hex}</code>
                  </td>
                  <td>
                    <code>{c.ansi256}</code>
                  </td>
                  <td>{MEANING[role]}</td>
                  <td>
                    <span className="cx-ratio">{ratio.toFixed(2)}:1</span>
                    <span className="cx-dim"> on ground</span>{' '}
                    <span className={`cx-grade cx-grade--${grade}`}>
                      {grade === 'text'
                        ? 'AA text'
                        : grade === 'large'
                          ? 'large text and graphics only'
                          : "glyph only, always beside the word 'failed'"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Scroller>
      <p className="cx-fine cx-fine--block">
        <code>stop</code> is for a real failure or a policy stop, drawn as the <code>!</code> glyph beside the word
        “failed”, and only on the ground colour — on the lighter pane panels the ratio is lower still. It is never used for
        body text, and never for Hell. A further role, <code>arbor</code>, is reserved for
        canonical Arbor evidence that changed a composition decision. Nothing does that today, so no surface draws it and
        it has no swatch here.
      </p>
    </section>
  )
}
