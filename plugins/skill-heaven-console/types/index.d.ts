// The console's session state contract: the one `$.state` value its drawings read.
//
// The engine requires this file to be self-contained (no import), so the status
// model's own types cannot be named here. `status` and each entry's `event` are
// therefore opaque plain data (`ConsoleData`) at this seam; hooks/model.ts gives
// them their real types — SkillHeavenStatus and SummonEvent from the one status
// model — in exactly one place, and nothing else casts.

/** Plain, JSON-shaped data. */
export type ConsoleData = string | number | boolean | null | ConsoleData[] | { [key: string]: ConsoleData }

export type ConsoleSection = 'session' | 'scope' | 'flow' | 'trust'

/** One summon-tool call the console observed (a real summon, or a /lens preview). */
export type ConsoleEntryData = {
  id: number
  /** A SummonEvent (status model). */
  event: ConsoleData
  /** Which agent the host reported for the call; null = the main conversation. */
  agent: string | null
  /** How the console came to know: a tool call it watched, or its own /lens preview. */
  via: 'tool' | 'lens'
  /** One slot per stored skill: who read its materialized SKILL.md (a label, never a path), or null. */
  readBy: (string | null)[]
  /** Skills the result named beyond the bounded number stored here. */
  omitted: number
}

/** What the Lens band shows. null = nothing (the default). */
export type ConsoleBand =
  | { kind: 'event'; id: number }
  | { kind: 'looking'; query: string }
  | { kind: 'not-connected' }
  | null

/** An agent the host reported (an `agentId` on a tool call, or an Agent call). */
export type ConsoleAgent = {
  /** The Agent call's tool_use_id until the host names the agent, then its agentId. */
  key: string
  /** The host's agent id, when it has been reported. */
  id: string | null
  /** Sanitized: subagent type and the call's own description. */
  label: string
  /** running = a foreground call is open; started = launched in the background, end not observed; returned = observed to finish. */
  state: 'running' | 'started' | 'returned'
}

export type ConsoleStateData = {
  /** A SkillHeavenStatus (status model). */
  status: ConsoleData
  /** Newest last, at most 50. */
  entries: ConsoleEntryData[]
  band: ConsoleBand
  agents: ConsoleAgent[]
  /** True once the host reported any agent id this session. */
  agentIdsSeen: boolean
  section: ConsoleSection
  /** UI only: opened intentionally, never by a tool observation. */
  inspectSection?: boolean
  bandRequested?: boolean
  /** The receipt row that is expanded in the Session section. */
  openEntry: number | null
  /** The rung command the person typed, sanitized, for the Scope section. */
  selectedFrom: string | null
  /** Claude Code's version string, when the host reported it. */
  hostVersion: string | null
  seq: number
}

declare module 'claude-code' {
  // The optional launcher uses the same bundled server/schema under this
  // second exact spelling. Generated marketplace tables know only the first.
  interface McpToolInputs {
    'mcp__skill-summon__summon': { query: string; limit?: number; surface?: 'any' | 'heaven' | 'hell'; source?: string; preview?: boolean }
  }
  interface PluginState {
    'skill-heaven-console': { state: Shaped<ConsoleStateData> }
  }
}
