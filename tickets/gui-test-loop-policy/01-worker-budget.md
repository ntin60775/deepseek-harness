# Тикет 01 — Половинный бюджет воркеров под memory-cap 48

Блокеры: нет.
Спека: [docs/plans/gui-test-loop-policy.md](../../docs/plans/gui-test-loop-policy.md), пункт «Готово» 1.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Focused-прогон `pnpm exec vitest run packages/client/ui-mermaid` на 12-ядерной машине использует 6 форков вместо 12: система остаётся отзывчивой во время тестов. На 256-CPU хосте бюджет по-прежнему 48 (memory-guard сохранён). CI и явные override (`--maxWorkers`, `DSH_COVERAGE_MAX_WORKERS`) ведут себя как раньше.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Формула helper.** Артефакт: вывод vitest `scripts/parallelism.spec.ts`. Ожидание: локальный бюджет vitest = `max(1, min(floor(available/2), 48))` — кейсы 12→6, 1→1, 3→1, 256→48, CI=true→available; `LOCAL_TEST_PARALLELISM_CAP` остаётся cap поверх формулы. На базе: halving-кейсы красны (сегодняшний `defaultParallelism` с test-cap даёт 12 на 12 CPU, 16 на 16 CPU); кейсы 1→1 и CI зелёны на базе и остаются зелёными (инварианты).
2. **Потребитель run-gates.** Артефакт: вывод vitest `scripts/run-gates.spec.ts`. Ожидание: новый кейс `ciWorkerEnvironment('ci-coverage', {}, 16)` даёт `DSH_COVERAGE_MAX_WORKERS: '8'` и partitions 6; существующие кейсы зелёные без правок (256 CPU → 48/32 благодаря cap; override '6' читается напрямую в `ciWorkerEnvironment` и перебивает testBudget). На базе: новый кейс красный (16 вместо 8).
3. **Applied-бюджет корневого конфига.** Артефакт: вывод vitest `scripts/lane-test-budget.spec.ts` с новым ассертом импортированного `vitest.config.ts`. Ожидание: локальный `maxWorkers` корневого конфига равен формуле (6 при 12 CPU), CI-ветка не передаёт maxWorkers. На базе: ассерт красный (конфиг даёт 12).
4. **Живая проба.** Артефакт: вывод focused-прогона `packages/client/ui-mermaid` на дереве тикета. Ожидание: прогон зелёный, число воркеров соответствует формуле; критерий верификационный (base-proof несут критерии 1–3).

## Охранники

- CI-поведение не меняется: ветка `CI=true` в helper и конфиге зелёная на базе и на дереве тикета.
- Приоритет override сохранён: существующие зелёные кейсы `run-gates.spec.ts` (явный `DSH_COVERAGE_MAX_WORKERS`, невалидный override бросает) не редактируются.
- Build/gate бюджет `LOCAL_PARALLELISM_CAP=12` не тронут: кейсы `defaultConcurrency` в `run-gates.spec.ts` зелёные без правок.

## Примечания исполнения

- Потребители test-cap: `vitest.config.ts` (localWorkerBudget) и `scripts/run-gates.ts` (testBudget в `ciWorkerEnvironment`); иных импортов `LOCAL_TEST_PARALLELISM_CAP` нет (проверено срезом critic-env).
- Lane-конфиги e2e/expected/snapshot/web/bench имеют собственные бюджеты и не меняются.
- Отчёт доказательств — в этот файл; proofs — `tickets/gui-test-loop-policy/proofs/`.

## Доказательства по критериям

1. **Формула helper.** Артефакт: `proofs/01-green.log` (176/176, Start at 17:54:19) + `proofs/01-base-proof-full.log`. Ожидание: 12→6, 1→1, 3→1, 256→48, CI 256→256. Факт: кейс «halves local Vitest forks under the memory cap» зелёный; на базе TypeError (функции нет). Расхождений не было.
2. **Потребитель run-gates.** Артефакт: те же логи. Ожидание: 16 CPU → '8'/'6'. Факт: кейс зелёный; на базе received '16'/'11' (полный дифф в full-логе). Расхождений не было.
3. **Applied-бюджет корневого конфига.** Артефакт: зонд в `proofs/01-green.log` (base 12 → fixed 6) + зонд-кейс lane-test-budget.spec. Ожидание: инварианты (целое ≥1, ≤48, < available при available>1). Факт: 6 при 12 CPU, кейс зелёный; на базе «expected 12 to be less than 12». Носитель изменен относительно спеки: статический импорт конфига ломал composite typecheck (TS6307, находка P1 ревью-панели) — заменён runtime-зондом в дочернем процессе; критерий не изменён.
4. **Живая проба.** Артефакт: `proofs/01-green.log`, блок живой пробы (77 passed | 2 skipped, 18.97s) + зонд applied-бюджета. Ожидание: прогон зелёный с бюджетом 6. Факт: совпадает. Расхождений не было.

## Расхождения

- Ожидание/факт по критериям: не было.
- Ревью-панель (один прогон, 4 роли): P1 статический импорт конфига → runtime-зонд; P2 мёртвый cap-параметр `defaultParallelism` удалён, JSDoc обновлён; P2 тавтология формулы в ассерте → инварианты; P2 proofs не в коммите → перенесены в worktree и коммитятся; P3 wording/JSDoc правки внесены. Реестр зацепок: открытых ишью нет.
- Инварианты «1→1» и «CI→available» в base-прогоне skipped (-t halves), не показаны зелёными на базе; названо честно в base-proof логе.