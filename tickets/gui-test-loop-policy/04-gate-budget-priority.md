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

## Доказательства по критериям

1. **Gate-бюджет.** Артефакт: `proofs/04-green.log` (202/202, Start at 11:14:54) + `proofs/04-base-proof-full.log`. Ожидание: 12→6, 256→12, 1→1, 3→1, CI 256→256, ко-обновлённые 4→2 и ci-static 8→4. Факт: кейсы зелёные; на базе halving-кейс «expected 12 to be 6» и ко-обновлённый «expected 8 to be 4» красны. Расхождений не было.
2. **Приоритет.** Артефакт: `proofs/04-green.log` (mock-кейсы + реальная child-проба) + `proofs/04-base-proof-full.log` (6 красных на базе). Ожидание: дефолт 19, opt-out 0, кастом 7, невалидные значения — громкий отказ до setPriority, CI no-op. Факт: кейсы зелёные; child-проба читает приоритет против PRIORITY_LOW, причинность изолирована негативным контролем (отказ EACCES при попытке поднять nice из lowered-родителя). Расхождение при разработке: libuv возвращает EACCES, не EPERM — регэксп контроля ловит оба, названо в коде.
3. **Entrypoints.** Артефакт: `proofs/04-live-nice.log` (живой run-gates doc-quick на nice 19) + wiring-охранник в `proofs/04-green.log` (все три entrypoint содержат вызов). Ожидание: агрегаты lowering, дети наследуют, прямые verify-* — нет. Факт: ps-сэмпл 19, охранник зелёный. Расхождений не было.
4. **Инварианты CI и override.** Артефакт: `proofs/04-green.log` — существующие кейсы run-gates.spec (CI-ветка, 256→48/32, DSH_COVERAGE_MAX_WORKERS, doc-sync cap 8) без правок. Ожидание: CI и override не тронуты. Факт: зелёные. Расхождений не было.

## Расхождения

- Ожидание/факт по критериям: не было.
- Ревью-панель (один прогон, 4 роли; роль tests дошла до рестарта хоста, три роли перезапущены одной повторной пробой): P2 Windows-JSDoc (Node маппит значения в классы приоритета, не падает) → формулировка исправлена; P2 секция доказательств → добавлена; P2 причинность child-пробы и Windows-хрупкость (tests) → before/after + негативный контроль + PRIORITY_LOW; P3 литералы, wiring-охранник, change-narration в комментариях → внесены.
- Имя пробы в base-логе («lowers a real child process to nice 19») — снапшот до правок панели; в финальном дереве проба называется «lowers a real child process priority with an isolated causality control».