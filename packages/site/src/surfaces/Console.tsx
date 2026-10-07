// /console — inspectable prototype of every projection (docs/CONTROL-PLANE.md §5.5). Placeholder; built in slice S5.
import { renderStatusSegments, toPlain } from '@gaia-skill-heaven/status'
import { STATUS_FIXTURES } from '@gaia-skill-heaven/status/fixtures'

export default function Console() {
  return <main id="main">{toPlain(renderStatusSegments(STATUS_FIXTURES.fresh!.status, 'compact'))}</main>
}
