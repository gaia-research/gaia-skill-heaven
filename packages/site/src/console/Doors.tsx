import { CHIP_LABEL, CHIP_MEANING, HARNESS_PATHS } from '@gaia-skill-heaven/status'
import { Scroller } from './Pieces'

/** The door matrix: one row per harness, straight from HARNESS_PATHS. */
export function DoorsSection() {
  return (
    <section id="doors" className="cx-sec" aria-labelledby="h-doors">
      <h2 id="h-doors">Door matrix</h2>
      <p className="cx-lede">
        One verification chip per harness, with the version the evidence was recorded on. A version installed on your
        machine is not the probed version unless the row says so. The status entry column says what the persistent line
        can do on that harness today.
      </p>
      <Scroller label="Harnesses, verification chip, probed version and status integration" className="cx-tablewrap">
        <table className="cx-table cx-table--doors">
          <caption className="sr-only">Harness verification and status integration</caption>
          <thead>
            <tr>
              <th scope="col">Harness</th>
              <th scope="col">Chip</th>
              <th scope="col">Probed version</th>
              <th scope="col">Status entry</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {HARNESS_PATHS.map((h) => (
              <tr key={h.id} id={`doors-${h.id}`}>
                <th scope="row">{h.name}</th>
                <td>
                  <span className={`cx-chip cx-chip--${h.chip}`} title={CHIP_MEANING[h.chip]}>
                    {CHIP_LABEL[h.chip]}
                  </span>
                </td>
                <td>
                  <code>{h.probedVersion ?? 'not probed'}</code>
                </td>
                <td>
                  <span className="cx-chip">{h.statusIntegration}</span>
                </td>
                <td>{h.statusNote}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Scroller>
      <dl className="cx-modes cx-modes--chips">
        {(Object.keys(CHIP_LABEL) as Array<keyof typeof CHIP_LABEL>).map((chip) => (
          <div key={chip}>
            <dt>
              <span className={`cx-chip cx-chip--${chip}`}>{CHIP_LABEL[chip]}</span>
            </dt>
            <dd>{CHIP_MEANING[chip]}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
