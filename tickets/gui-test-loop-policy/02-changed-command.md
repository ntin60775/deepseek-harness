# Тикет 02 — Команда test:gui:changed

Блокеры: нет (тикет 01 улучшает демо, но не блокирует).
Спека: [docs/plans/gui-test-loop-policy.md](../../docs/plans/gui-test-loop-policy.md), пункт «Готово» 2.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Правлю src-файл `packages/client/ui-mermaid`, запускаю `pnpm run test:gui:changed` — команда выбирает и гоняет только related-спеки затронутого пакета, печатает выборку. Удаляю src-файл — команда гоняет весь spec-scope его пакета. Ничего не менял — «0 tests selected», exit 0. Новая незакоммиченная спека в tests/ попадает в выборку и исполняется.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Команда существует.** Артефакт: строка `test:gui:changed` в `package.json` + файл `scripts/run-gui-changed.ts` + вывод запуска. Ожидание: скрипт (tsx) собирает tracked-изменения `git diff HEAD` (включая staged) и untracked `src/**/*.{ts,tsx}` без `*.d.ts` плюс untracked `tests/**/*.{spec,test}.{ts,tsx}` в scope `packages/client` + `packages/host`, передаёт существующие файлы в `vitest related --run`. На базе: команды и скрипта нет.
2. **Fixture-спека выборки.** Артефакт: вывод vitest `scripts/run-gui-changed.spec.ts` на fixture git-репозитории. Ожидание: кейсы tracked-правка, untracked-новый src, untracked-новая спека (исполняется сама), `.d.ts` отсечён, правка вне scope печатается числом, пустой diff → «0 tests selected» exit 0. На базе: спека красная (скрипт отсутствует).
3. **Правило удалений.** Артефакт: fixture-кейс удаления + вывод запуска. Ожидание: удалённый путь в пакете → полный spec-scope пакета (`vitest run <pkg>`), удалённые пути не передаются в related (related молча игнорирует несуществующие файлы и принудительно ставит passWithNoTests — эмпирика гейта проекций). На базе: кейс красный.
4. **Честная слепая зона.** Артефакт: fixture-кейс «изменённый файл есть, related-тестов ноль» + вывод. Ожидание: явное предупреждение со слепыми зонами related (config, dynamic loading, subprocesses, built artifacts) и указанием выбрать owning-тесты вручную; exit 0; вывод не является доказательством для push. На базе: кейс красный.
5. **Живая проба.** Артефакт: вывод `pnpm run test:gui:changed` после реальной правки src-файла client-пакета на дереве тикета. Ожидание: выбранные спеки соответствуют затронутому пакету, прогон зелёный; критерий верификационный (base-proof несут критерии 1–4).

## Охранники

- Голый `vitest --changed` не используется (игнорирует path-фильтр, шумит от untracked build-артефактов — спайк 2026-11-18).
- Одно детерминированное правило выбора: без fallback-веток; удаления → пакетный scope, не деградация.
- Правила dsh-pre-push-checks не меняются: пустая выборка и предупреждение — сигналы dev-loop, не push-доказательство.

## Примечания исполнения

- Прецеденты fixture-git спек: `scripts/translation-pairing.spec.ts`, `scripts/rescope-vendor.spec.ts`.
- Отчёт доказательств — в этот файл; proofs — `tickets/gui-test-loop-policy/proofs/`.

## Доказательства по критериям (финальное дерево, proofs пересняты после правок панели)

1. **Команда существует.** Артефакт: строка `test:gui:changed` в package.json + `scripts/run-gui-changed.ts` + `proofs/02-live-related.log`. Ожидание: сбор tracked + untracked выборки, передача в vitest related. Факт: проба 1 выбрала 2 related-спеки ui-mermaid, 11 тестов. На базе: команды нет (`proofs/02-base-proof.log`, mutation-проба на финальной спеке). Расхождений не было.
2. **Fixture-спека выборки.** Артефакт: `proofs/02-green-full.log` (18/18, Start at 18:53:51). Ожидание: selection-кейсы включая untracked .spec.tsx/.test.ts, .d.ts-симметрию, смешанный случай. Факт: 12 selection-кейсов зелёные. Расхождений не было.
3. **Правило удалений.** Артефакт: `proofs/02-deletion-raw.log` (сырой вывод fixture-запуска) + end-to-end кейс. Ожидание: пакетный scope, обе спеки пакета исполнены, exit 0. Факт: «deletion package scope: packages/client/demo», a.spec.ts и b.spec.ts в выводе репортёра, 2 passed. Правило шире буквы критерия и названо явно: пакетный scope покрывает все изменения пакета с удалением (правки этого пакета не идут в related); mixed-кейс пинит сохранение related других пакетов. Расхождений не было.
4. **Честная слепая зона.** Артефакт: end-to-end кейс с orphan-модулем в `proofs/02-green-full.log` (ассерт полной фразы предупреждения). Ожидание: предупреждение со слепыми зонами, exit 0. Факт: кейс зелёный. Расхождение при разработке: маркер vitest — «No test files found», а не «No related files found» из dist-чтения; регэксп ловит оба, названо в коде.
5. **Живая проба.** Артефакт: `proofs/02-live-related.log`, `proofs/02-live-entry.log`. Ожидание: выборка соответствует затронутым модулям. Факт: проба 1 — 2 спеки/11 тестов; проба 2 — 1 спека/6 тестов. Расхождений не было.
6. **Exit-коды и подкаталог (правки панели).** Артефакт: end-to-end кейсы «propagates a failed Vitest run exit code» (status 1) и «launched from a package subdirectory» (root через rev-parse, те же изменения). Факт: зелёные в 02-green-full.log.

## Расхождения

- Ожидание/факт по критериям: не было.
- Ревью-панель (один прогон, 4 роли; правки одним раундом): P1 тихий no-op при cwd≠корень → root через `git rev-parse --show-toplevel` + `git -C`; P1 typecheck noUncheckedIndexedAccess → checked nextToken-парсер; P1 сырой SHA в proofs → описание базы, гейт verify-repository-references зелёный; P1 proofs аттестовали пред-фикс ревизию → все логи пересняты на финальном дереве; P2 spawn result.error/maxBuffer → hardened git() и runVitest (16 MiB, error named); P2 env изоляция fixture → sanitized childEnv (GIT_*/VITEST*/DSH_COVERAGE_*, GIT_CONFIG_GLOBAL=/dev/null, SIGKILL, child.error); P2 untracked-спека без артефакта исполнения → e2e кейс с выводом репортёра; P2 вывод критерия 3 отсутствовал → сырой fixture-лог; P3 passWithNoTests пакетного scope, симметрия .d.ts, счётчики, depth-guard packageRoot, exit-code и mixed кейсы, coverage-exempt инвентарь, JSDoc wording — внесены.
- git()-хелперы change-scope.ts приватные; экспорт ради одного потребителя расширил бы чужой API — свой hardened git() по тому же прецеденту (названо, не молча).
- Прямые запуски отдельных verify-* скриптов не наследуют приоритет агрегатов — граница для дока политики (тикет 03/04).
- continue.md: регистрация юнита при мерже (работа лида).
