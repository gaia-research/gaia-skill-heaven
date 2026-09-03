# Brief — authoring gold capability-gap queries for the Skill Heaven benchmark

You are writing evaluation data for a retrieval benchmark. The queries you write
decide whether a measurable improvement is real, so the single most important
property is that they are **honest** — written the way a working agent phrases a
capability gap, NOT written to be easy to match.

## The hard rule: do not leak the document's vocabulary

Each query is scored against an index built from the skill's own name, title,
tags and description. If you reuse those words, you have written a query that a
dumb substring matcher answers trivially, and the benchmark measures nothing.

For each target skill, before writing:

1. Read its name, title, tags, description.
2. Build a mental **ban list** of the distinctive content words in those fields
   (proper nouns, tool names, and the specific technical nouns the description
   leans on).
3. Write the query using **as few of those words as you can manage**. Aim for at
   most ONE overlapping distinctive word, and prefer zero.

Concretely: for a skill described as *"Executes the full automated test suite,
collects pass/fail counts and coverage deltas"*, a BAD query is
`"run the automated test suite and get coverage deltas"` (pure copy). A GOOD
query is `"did anything break after my last change?"` or
`"I want to know which parts of this repo nothing is exercising"`.

## Register

First person, present tense, the way a developer states a need mid-task. Some
should be blunt ("make this API faster"), some situational ("my CI is green
locally but red on the runner and I can't tell why"). Vary length: roughly a
third short (4-8 words), a third medium, a third a full sentence of context.
No question marks required. No "I need a skill that..." framing — describe the
GAP, never the tool.

## Uniqueness

The corpus has near-duplicates. Your query must be answerable by YOUR target
skill and not equally well by another skill in `corpus-listing.txt`. Grep the
listing for competitors before you commit to a query. If a target genuinely
cannot be distinguished from a sibling by any honest query, do not invent one:
emit the entry with `"ambiguous": true` and a one-line `"note"` saying which
skill it collides with. A flagged entry is a useful finding; a fudged one is
corrupt data.

## Output format

One JSON object per line (JSONL), no wrapping array, no markdown fences:

{"query":"...","skillId":"contributor/slug","level":"3★","rationale":"one line: what the caller is actually trying to do","overlap":["words you could not avoid reusing"]}

`overlap` is your own audit of vocabulary leakage — list every distinctive word
your query shares with the skill's name/title/tags/description. An empty array
is the goal; more than two is a rewrite.
