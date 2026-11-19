# Тикет 04 — Gate-бюджет и приоритет локальных тяжёлых прогонов

Блокеры: нет (тикет 01 слит; формула бюджета и helper-модуль существуют).
Спека: [docs/plans/gui-test-loop-policy.md](../../docs/plans/gui-test-loop-policy.md), пункт «Готово» 8.
Гейт проекций: [projections.md](projections.md) (юнит-уровень; пункт 8 добавлен решением оператора 2026-11-18 после прогона).

## Демо-путь

Две параллельные сессии запускают тяжёлые лейны (doc-sync, build, typecheck, test) — интерактивная работа остаётся отзывчивой: планировщик ОС вытесняет nice-19 процессы, каждая сессия держит половину ядер. `pnpm run doc-sync` на 12-ядерной машине использует 6 gate-воркеров вместо 12; `DSH_LOCAL_PRIORITY=0` возвращает обычный приоритет; CI не тронут.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Gate-бюджет.** Артефакт: вывод vitest `scripts/parallelism.spec.ts`. Ожидание: `defaultParallelism` локально = `max(1, min(floor(available/2), LOCAL_PARALLELISM_CAP=12))` — кейсы 12→6, 256→12, 1→1, 3→1, CI=true→available; ко-обновление затронутых существующих кейсов (4→2 в «caps local runs», 8→4 в `run-gates.spec.ts` defaultConcurrency) с названной причиной. На базе: halving-кейсы красны (сегодня 12 при 12 CPU).
2. **Приоритет.** Артефакт: child-process проба в `scripts/parallelism.spec.ts` (spawn node, вызов `lowerLocalPriority`, печать `os.getPriority()`). Ожидание: дефолт локально 19; `DSH_LOCAL_PRIORITY=0` → 0; `DSH_LOCAL_PRIORITY=7` → 7; невалидное значение («abc», 20, -1) падает громко при вызове; CI=true не меняет приоритет. На базе: функции нет, проба красная.
3. **Entrypoints.** Артефакт: дифф `scripts/run-gates.ts` (main), `scripts/build.ts` (main), `vitest.config.ts` (загрузка конфига) + живая проба `getPriority` после запуска агрегата. Ожидание: все три lowering приоритет локально через один helper; дети наследуют; прямые запуски отдельных verify-* скриптов приоритет не меняют (граница названа в JSDoc). На базе: приоритет не меняется (проба печатает 0).
4. **Инварианты CI и override.** Артефакт: существующие зелёные кейсы `run-gates.spec.ts` (CI-ветка, DSH_COVERAGE_MAX_WORKERS, DSH_GATE_CONCURRENCY) без правок + кейс CI-приоритета. Ожидание: CI-бюджеты и приоритет не тронуты; явные env-override бюджета работают. На базе: зелёные (инварианты).

## Охранники

- Lane-бюджеты vitest (e2e/expected/snapshot/web/bench) и формула тикета 01 не меняются.
- Приоритет — процессный эффект с явным env-opt-out; никакого скрытого глобального состояния в helper-модуле (вызов только из entrypoints).
- Невалидный `DSH_LOCAL_PRIORITY` падает громко при старте, не молча деградирует.

## Примечания исполнения

- Граница покрытия: агрегаты (run-gates, build, vitest config) lowering приоритет; отдельные verify-* скрипты при прямом запуске — нет (док политики тикета 03 называет обход: агрегат или nice-обёртка).
- Отчёт доказательств — в этот файл; proofs — `tickets/gui-test-loop-policy/proofs/`.