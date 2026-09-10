# Agent Note: Fork Web UI gaps against the reference terminal

Status: proposed

## Problem

The fork's Web UI now carries the gruvbox skin, the status band and the collapsed-row statistic, all recorded in [the skin note](../../implemented/architecture/2026-09-10-fork-web-ui-gruvbox-skin.md). Four gaps against the operator's reference terminal were deliberately left open when that work shipped, and each was named there rather than silently dropped. They are collected here so the next round starts from a written scope instead of re-deriving it.

## Proposal

Finish the four gaps, each as its own change with its own evidence.

**Diff gutter and intra-line highlighting.** The diff card shows `+`/`-` prefixes and per-line colors but neither the file's line numbers nor which words inside a changed line moved. `DiffBlock` would parse hunk headers (`@@ -a,b +c,d @@`) to carry old and new line numbers per row, render a fixed-width gutter, and mark changed words inside a line pair. The reference terminal reserves three digits in the gutter so a streaming preview never re-flows rows already drawn; the same reservation keeps a growing file from shifting the body here.

**One-line status band.** At chat-content width the band's own segments (about 284 px) plus the shipped statistics pills (about 598 px) exceed the 845 px the composer column offers, so the band wraps onto two lines. The pills stay — they own the click-to-open detail panels — so the options are to tighten the band's padding and gaps, to let the band exceed the chat column with a documented cap, or to move the segments into the pills' own row and let the pills' long labels ellipsize. The last one hides shipped values and is rejected outright.

**Path, git and subagent segments.** The reference status line carries the workspace path, the git branch with staged/unstaged/untracked counts, and the number of running subagents. The path and the subagent count are client-side facts (the workspaces snapshot maps a Session to its workspace; the sessions service owns the subagent roster). Git state is not: no client service knows the repository, so this item needs a small host half publishing a git summary over the package-private JSON RPC, with its own effect-scoped lifetime.

**Counters for the remaining card kinds.** The collapsed-row statistic covers read, search, terminal and diff rows because those card models already carry a total. Web, todo and image rows carry none, so they show the bare summary; giving them a count means adding the total to those models, which also affects the non-chat render sites that consume them.

## Alternatives considered

**Do all four in the same change as the skin.** Rejected: the operator asked to stabilize what shipped before extending it, and the diff work is a primitive change with a wider blast radius than a skin.

**Ship the diff gutter by measuring rendered text.** Rejected: line numbers are data, not presentation. Deriving them from rendered rows would break on wrapped lines and on any future change to the row model.

**Leave the band on two lines.** Viable and currently shipped, but the operator explicitly asked for more readings in the band, and every added segment makes the wrap worse rather than better.

**Reach git through the shell tool from the client.** Rejected: a status band must not spawn a process per render, and the client has no business invoking tools.

## Acceptance criteria

The diff card shows line numbers and intra-line change marks on both the chat card and the standalone details surface, with focused specs for the header parse and the word diff and a keyless snapshot for the rendered card.

The band renders on one line at the default chat-content width with every shipped pill value still readable, verified by a screenshot on the virtual display and by measured element widths from the page.

Path, subagent and git segments appear with the reference layout's colors, hide themselves when their data is absent, and leave no host-side effect behind when the plugin stops.

Each item lands with `pnpm run test:gui`, the aggregate gates that its surface touches (`doc-sync`, `hygiene`), and screenshots of a throwaway harness home on the Xvfb display — never the operator's desktop or session store.

## Risks

`DiffBlock` is a shipped primitive shared by the trajectory and details surfaces, so the gutter widens every consumer; the parse must tolerate malformed hunks by falling back to the current rendering rather than failing a card.

Widening the band past the chat column risks reading as a misaligned element beside the composer card; the cap has to be justified by a measurement, not by taste.

A host half for git adds a process-boundary surface that must be effect-scoped and reversible, and it must not turn a render into a subprocess spawn.
