---
node_type: gotcha
title: Profile patch rows replace the whole config
service: _platform
status: active
updated: 2026-11-19
tags: [fork, profile, config, presets, gotcha]
links:
  part_of: [README.md]
  relates_to:
    - fork-merge-ritual.md
    - ../architecture.md
  implemented_by:
    - ../../scripts/fork-merge-ritual.sh
    - ../../packages/boot/app-boot/src/index.ts
    - ../../packages/boot/app-boot/src/config-schema/collect.ts
---

# Profile patch rows replace the whole config

A profile patch row replaces the targeted entry's `config` key wholesale; it does not deep-merge. A row that restates one field silently drops every other field the bundle supplied, including the required ones, and the affected plugin fails activation with `ValidationError: invalid config: $.<field> missing required value`.

## The 2026-11-18 incident

`~/.dsh/profiles/web/cordis.patch.yml` carried the 1C contour's default-preset row:

```yaml
- id: agent-preset-registry
  name: "@deepseek-ai/dsh-agent-preset-registry"
  config:
    selectedDefault: 1c
```

`@deepseek-ai/dsh-web-app` supplies `default: standard` for the same entry, and the profile layer runs last, so the composed config became `{ selectedDefault: 1c }`. The registry's schema requires `default`, so the entry never activated: `agentPresets` was absent, `preset-standard`/`ptc`/`minimal`/`cordis` stayed `pending (waiting for service: agentPresets)`, every new Agent mounted without a preset, and the only visible symptom was a client settings error — `gateway/service-unavailable: active Service "agentPresets" is unavailable` — plus Agents running with the preset-free toolset.

Nothing in rc.3 or rc.4 changed this contract: `vendor/include/src/patch.ts` replaces each supplied key, `packages/boot/app-boot/src/profile.ts` applies the profile layer after every bundle layer, and the registry's `Config` required `default` in both releases. The row was invalid from the day it was written; the merge only made it visible.

## Why the failure was silent

Startup reports a non-required entry that does not activate as a warning and exits 0. `requiredStartupEntryIds` in [app-boot](../../packages/boot/app-boot/src/index.ts) named only the execution and transport entries, so a dead preset registry degraded the product instead of failing the boot.

## Guards now in place

- `agent-preset-registry` is a required startup entry: an enabled registry that fails activation aborts startup with the entry's own `ValidationError`, so the failure names the config path instead of surfacing as missing tools.
- `dsh --profile <name> --dump-config-schema` validates every literal composed `config` against its plugin schema without mounting plugins, reports `invalid config: …`, and exits 1. Entries whose `config` holds a `!!js` expression, and entries whose `disabled` is not literal `false`, stay runtime-only. `collectConfigSchemas` validates only with `validateConfigs`; the CLI dump sets it.
- The [fork merge ritual](fork-merge-ritual.md) runs that dump for every profile under `$DSH_HOME/profiles` after `typecheck` and `constraints`, because an upstream merge can add a required field that only a profile row violates.

## Diagnostics that are not profile errors

The dump exits 1 for two different reasons: an invalid config, and an incomplete tree. Three findings look alarming on a healthy profile and only one of them is a profile defect.

- `unrecognized Loader tree carrier`, once per `@deepseek-ai/dsh-agent-preset` row. The preset plugin declares `static readonly [EntryGroup.key] = true`: it owns its `config.plugins` children and hands their unevaluated expressions to the registry, so the collector cannot classify or expand them. The diagnostic is accurate — the dump does not represent preset children — and the preset patch files are identical to upstream, so every stock Web profile reports one per preset. The ritual phase greps `invalid config:` instead of trusting the exit code.
- `patch: entry "…" not found` — a row whose target id exists in no selected bundle. This one IS a profile defect: the row is dead. The home layer `$DSH_HOME/cordis.patch.yml` carries the same rule, and a comment-only file is rejected as not a top-level array, so an emptied layer keeps `[]`.
- Validation warnings (`transform callback …`, `regular-expression …`, `loose validation …`) describe schema capabilities the dump cannot exercise without mounting a plugin. They never fail the dump.

## When you edit a profile row

Restate every field the schema requires, then run `dsh --profile <name> --dump-config-schema` before restarting the host. A `patch: entry "…" not found` warning means the id or the bundle selection is wrong, not that the row is harmless.