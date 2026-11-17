# Agent Note: Disclose the browser-bundled dependency closure in third-party notices

Status: implemented

## Problem

`THIRD_PARTY_NOTICES.md` disclosed direct workspace declarations plus the direct browser inputs resolved by the shipping builds. A private browser copy ships its whole dependency tree inside one artifact: the ui-mermaid lazy chunk embedded 56 package roots while the registry and the chunk's license banner credited seven. Four bundled packages sat in the development-only tier against its own definition («without distribution inside a Host or browser bundle»), and about fifty were absent from the registry; the generator's browser walk stopped at the first third-party boundary, so the nested mermaid bundle was invisible to it. The [notices policy note](2026-07-30-generated-third-party-notices.md) owns the base tier policy and rejected enumerating the full npm closure.

## Decision

The browser disclosure set is the installed dependency closure of every direct distributed browser input, not the direct inputs alone: a package whose code ships inside a browser artifact is runtime whichever manifest section declares it, so distribution outranks a development declaration. The walk follows `dependencies` and installed `optionalDependencies` through the pnpm sibling link farm, skips type-only `@types/*` packages (erased at compile time, never distributed), and deduplicates by real package root. The same closure feeds the ui-mermaid chunk's license banner, and the package's bundle-split spec pins banner coverage against the chunk's sourcemap roots. Closure metadata still fails loud; four `OVERRIDES` entries record why the installed store cannot answer (khroma and jstat lack a license field, the buffers tarball predates its upstream license field, @fortune-sheet/formula-parser lacks a repository field). The full npm closure remains in the lock files. The [mermaid diagram-card note](../feature/2026-11-16-mermaid-fence-diagram-cards.md) records the rendering decision that surfaced the gap.

## Alternatives considered

- **A fixed license-root list**: the original seven roots missed most of the embedded tree, and a list curated per package rots on every dependency change; the installed closure is the exact disclosure set.
- **The full npm transitive closure**: still rejected as in the base note — thousands of packages bury the direct dependencies a reader evaluates. The browser subset is bounded (208 identities at this cut) and every member's code actually ships in a browser artifact.
- **A banner-only fix without the registry**: the chunk would be self-disclosing, but the development-only tier would keep contradicting its own definition for bundled packages.

## Consequences

The runtime tier grew by the browser closure (158 identities at this cut); cytoscape, cytoscape-cose-bilkent, dayjs, and @braintree/sanitize-url moved out of development-only. The generator reads installed manifests for closure members, so the tree must be installed — already a generator requirement. The mermaid chunk's banner grows with every embedded package's license text (+76564 B raw, +4486 B gzip). Packages whose exports block `require.resolve` are reached through the sibling link farm rather than dropped.
