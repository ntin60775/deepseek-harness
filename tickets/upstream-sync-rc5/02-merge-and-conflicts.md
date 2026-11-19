# Тикет 02 — Мерж и конфликты

Блокеры: 01 (ритуал должен уметь диапазон и генерируемые конфликты).
Спека: [docs/plans/upstream-sync-rc5.md](../../docs/plans/upstream-sync-rc5.md), пункт «Готово» 3.
Гейт проекций: [projections.md](projections.md) (находки 2–3, 21–22).

## Демо-путь

В `git log` есть merge-коммит апстрима, в дереве — апстримовые страница ревью forge и плагины Notion/Linear, при этом сайдбар форка по-прежнему рисует постоянный рейл скроллбара, а композер — живой список дел; `fork:invariants` и `test:docs` зелёные.

## Критерии приёмки (падают на базовом коммите)

1. **Чистый старт.** Артефакт: `git status --porcelain` перед мержем. Ожидание: пусто; bookkeeping юнита (спека, строка в [docs/plans/README.md](../../docs/plans/README.md), исключение в [scripts/translation-pairing.manifest.json](../../scripts/translation-pairing.manifest.json)) закоммичен; чужая работа (`scripts/web-launcher/*`) закоммичена её владельцем, не мержем. На базе: дерево грязное, preflight ритуала падает.
2. **Merged.** Артефакт: `git log --merges -1` и `git rev-list --count HEAD..upstream/master`. Ожидание: merge-коммит с апстримом; счётчик ноль. На базе: апстрима нет.
3. **Семь конфликтов разрешены.** Артефакт: `git diff --check`, содержимое файлов. Ожидание: `ui-conversation/README.md` содержит и `onWorkspaceSelected`, и предложение про todo dock; `ui-sidebar/SidebarRoot.tsx` содержит `sidebar.panel.trailing` и `useId`, не содержит `quietBars`/`scrollHandoff`; четыре парных файла (`ui-conversation/README.zh.md`, `ui-conversation/README.i18n.yaml`, `ui-sidebar/README.i18n.yaml`, `ui-subagent/README.i18n.yaml`) взяты у апстрима. На базе: конфликты не разрешены, мерж не начат.
4. **Пары перезаписаны до коммита.** Артефакт: `pnpm run verify-translation-pairing`. Ожидание: зелёный на merge-коммите (не после него). На базе: хеши не перезаписаны, pre-commit job валит коммит.
5. **Генерируемый каталог.** Артефакт: `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts` после регенерации. Ожидание: содержит форк-строки `client-ui-mermaid` (`fence/mermaid`), `workspace.session-delete` и апстримовую `forge.review.conversation`. На базе: каталог в состоянии форка без апстримовой строки.
6. **Форк-инварианты.** Артефакт: `pnpm run fork:invariants`. Ожидание: зелёные (`sidebar-styles`, `elevation-styles`). На базе: зелёные — инвариант-охранник; краснеет при потере рейла или хайрлайна в резолве.
7. **Доки.** Артефакт: `pnpm run test:docs`. Ожидание: 21/21 на смерженном дереве. На базе: 21/21 — инвариант; краснеет при битой паре или ссылке в резолве.

## Охранники

- Мерж идёт только после чистого дерева; чужой диф не коммитится и не прячется в stash.
- Резолв не переписывает форк-инвариант в пользу апстрима: рейл сайдбара и хайрлайн остаются.
- `pnpm-lock.yaml` и генерируемые каталоги — сторона апстрима плюс регенерация, ручная правка запрещена.
- Pre-commit не обходится `--no-verify`.

## Примечания исполнения

- Точный список конфликтов перед запуском пересчитывается `git merge-tree --write-tree --name-only HEAD upstream/master`; спека фиксирует семь, новые коммиты могут добавить путь.
- `slot-catalog.ts` входит в `GENERATED_CONFLICTS` после тикета 01, поэтому конфликт снимается ритуалом, а не руками.
- Отчёт доказательств — в этот файл; логи — `tickets/upstream-sync-rc5/proofs/`.