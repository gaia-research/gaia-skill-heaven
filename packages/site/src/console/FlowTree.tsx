import { useState } from 'react'
import { sanitizeDisplay } from '@gaia-skill-heaven/status'
import { buildFlowTree, FLOW_VISIBLE_LIMIT, type FlowAgent, type FlowNode } from './derive'

/**
 * Flow (§5.3): agents and the skills they summoned, read-only. A nested list,
 * not an ARIA tree — nothing here is selectable, so list semantics are the
 * honest ones. State is a word AND a shape, never colour alone.
 */
const STATE_WORD: Readonly<Record<FlowAgent['state'], string>> = {
  running: 'running',
  returned: 'returned',
  unknown: 'state unknown',
}

function summonsText(n: number): string {
  return n === 0 ? 'no skills' : `${n} ${n === 1 ? 'summon' : 'summons'}`
}

function Children({ nodes, limit }: { nodes: FlowNode[]; limit: number }) {
  const [all, setAll] = useState(false)
  const hidden = Math.max(0, nodes.length - limit)
  const shown = all ? nodes : nodes.slice(0, limit)
  return (
    <ul className="cx-tree__list">
      {shown.map((child) => (
        <Node key={child.id} node={child} limit={limit} />
      ))}
      {hidden > 0 && (
        <li className="cx-tree__more">
          <button type="button" aria-expanded={all} onClick={() => setAll((v) => !v)}>
            {all ? 'show fewer' : `+${hidden} more`}
          </button>
        </li>
      )}
    </ul>
  )
}

function Node({ node, limit }: { node: FlowNode; limit: number }) {
  return (
    <li className="cx-tree__item">
      <span className="cx-tree__row">
        <span className={`cx-dot cx-dot--${node.state}`} aria-hidden="true" />
        <span className="cx-tree__label">{sanitizeDisplay(node.label, 48)}</span>
        <span className="cx-tree__meta">
          {STATE_WORD[node.state]} · {summonsText(node.summons)}
        </span>
      </span>
      {node.children.length > 0 && <Children nodes={node.children} limit={limit} />}
    </li>
  )
}

export function FlowTree({ agents, label, limit = FLOW_VISIBLE_LIMIT }: { agents: readonly FlowAgent[]; label: string; limit?: number }) {
  const roots = buildFlowTree(agents)
  return (
    <ul className="cx-tree" aria-label={label}>
      {roots.map((root) => (
        <Node key={root.id} node={root} limit={limit} />
      ))}
    </ul>
  )
}
