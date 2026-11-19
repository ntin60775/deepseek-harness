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
## Отчёт исполнения (2026-11-19)

### Ход мержа

- **Чистый старт.** В master висел чужой незакоммиченный `packages/client/ui-mermaid/README.md` (правка другой сессии). По решению оператора ждал владельца; к 15:03 `git status --porcelain` пуст, мерж стартовал на пустом дереве. Чужой `scripts/web-launcher/*` закоммичен владельцем до мержа (`fix(scripts): give the launcher's server the login-shell PATH`) и мержем не трогался. Bookkeeping юнита (спека, строка индекса, исключение пейринга) уже в `master` коммитом `docs(plans): open the rc.5 upstream sync unit…`.
- **Мерж.** `upstream/master` влит merge-коммитом апстрима (`Merge remote-tracking branch 'upstream/master'`); `git rev-list --count HEAD..upstream/master` — `0`. База мержа, снятая ритуалом до слияния, — точка расхождения master с апстримом (merge-коммит sync rc.4 → master), а не tip: тег `dsh-v0.2.2-rc.5` — предок tip`а апстрима, поэтому шапка аудита говорит «влит в HEAD: да», а диапазон считается от merge-base.
- **Семь конфликтов.** `ui-conversation/README.md` — сведены обе вставки: апстримовый абзац про `onWorkspaceSelected`/`headline` и форк-описание живого todo dock (авто-разворот на ходу, ручной коллапс до idle, метр done/total, кэп 180px). `ui-conversation/README.zh.md` и три `README.i18n.yaml` (`ui-conversation`, `ui-sidebar`, `ui-subagent`) взяты стороной апстрима и перезаписаны пейрингом до merge-коммита. `ui-sidebar/SidebarRoot.tsx` — сохранён форк-инвариант постоянно нарисованного рейла (нет `quietBars`, `scrollHandoff`, трекинга указателя) и добавлен апстримовый слот `sidebar.panel.trailing` с `useId` и `aria-describedby`. `slot-catalog.ts` снят стороной апстрима и восстановлен генератором.
- **Разрешение конфликтов, путь → как снят.** `ui-conversation/README.md` — ручное сведение обеих вставок; `ui-conversation/README.zh.md`, `ui-conversation/README.i18n.yaml`, `ui-sidebar/README.i18n.yaml`, `ui-subagent/README.i18n.yaml` — `git checkout --theirs`; `ui-sidebar/src/client/SidebarRoot.tsx` — ours + апстримовые `useId`/`aria-describedby`/`sidebar.panel.trailing`; `extensions/cordis-client-runner/src/client/slot-catalog.ts` — theirs от ритуала, форк-строки вернул `gen-client-catalog`.
- **Ритуал, четыре прогона.** (1) Демо-путь тикета 01 называл `pnpm run fork-merge-ritual`; такого скрипта в `package.json` нет — запускал `scripts/fork-merge-ritual.sh` (демо-путь тикета 01 исправлен этим же коммитом). (2) Первый прогон дошёл до классификатора темы и остановился на двух `NEW` слотах: `forge.review.conversation` и `sidebar.panellist.trailing` классифицированы в `theme-omp/verify/surfaces.json` как `inherits-dsh` с решениями в отчёте. (3) Второй прогон упал на `constraints`: форк-пакет `ui-mermaid` держал версию `0.2.2-rc.4` — поднята до `0.2.2-rc.5` вместе с регенерированным `slot-catalog.ts` отдельным коммитом. (4) Третий — preflight на грязном дереве после этого коммита; четвёртый прогон зелёный: build 10/10, typecheck 5/5, `constraints` (exit 0 под `set -euo pipefail`), `test:docs` (doc-quick) 21/21, snapshot 276 passed / 2 skipped, `FORK_SKIP_FULL_GUI=1` напечатал подмену, база записана `dsh-v0.2.2-rc.5`, три форк-воркфлоу остались `disabled_manually`, restore-коммит `chore(fork): restore fork-local surfaces after upstream merge`.

### Критерии приёмки

1. **Чистый старт.** `git status --porcelain` перед мержем — пусто; чужой диф не коммитился и не прятался в stash.
2. **Merged.** `git rev-list --count HEAD..upstream/master` = `0`; merge-коммит апстрима в `master`.
3. **Семь конфликтов.** `git diff --check` чист; `ui-conversation/README.md` содержит `onWorkspaceSelected` и форк-описание todo dock; `SidebarRoot.tsx` содержит `sidebar.panel.trailing`, `useId`, не содержит `quietBars`/`scrollHandoff`/`trackPointer`; четыре парных файла — сторона апстрима.
4. **Пары до коммита.** `pnpm run verify-translation-pairing` на смерженном дереве — `1354 pair(s) checked … all consistent`; merge-коммит прошёл pre-commit/pre-merge-commit jobs.
5. **Генерируемый каталог.** `slot-catalog.ts` после `gen-client-catalog` содержит форк-строки `client-ui-mermaid` (`fence/mermaid`) и `workspace.session-delete`, апстримовую `forge.review.conversation`.
6. **Форк-инварианты.** `pnpm run fork:invariants` — 27/27.
7. **Доки.** `pnpm run test:docs` — 21/21.

### Проверки и логи

- Сводка ритуала: [proofs/02-ritual.log](proofs/02-ritual.log) (сводные строки, коммиты заменены на `<commit>`).
- Слот-аудит форк-плагинов: `conversation.composer.dock` — `ok` (находка проекций 22); строка в [proofs/01-live-audit.log](proofs/01-live-audit.log) и в сводке ритуала.
- Build 10/10, typecheck 5/5 — в сводке лога; `constraints` прошёл (exit 0 под `set -euo pipefail`, отдельной строки в сводке нет); `test:docs` (doc-quick, не `doc-sync`) 21/21; snapshots 276 passed / 2 skipped. `doc-sync` — носитель пункта «Готово» 6 и прогоняется в тикете 04.
- Классификатор темы: `classify: OK` (254 элемента), два новых слота классифицированы; сам `surfaces.json` лежит вне репозитория (`~/home/dev/dsh-plugins/theme-omp`), решение записано здесь.

### Зелёный перепрогон (после правок панели)

Второй зелёный прогон ритуала шёл уже с сохранённой базой мержа и исправленным пересечением: аудит напечатал пост-мерж дельту `238 коммитов (мерджей 99)`, `гайдов 3 новых + 1 изменённый`, `файлов пересечения 61; апстрим изменил 960`; классификатор `OK`, инварианты 27/27, build 10/10, typecheck 5/5, `test:docs` 21/21, snapshot 276 passed / 2 skipped, база записана `dsh-v0.2.2-rc.5`, restore-коммит не потребовался. Пока прогон шёл, другая сессия слила юнит `mermaid-viewer-scale-zoom` (merge, docs, tests-фикс); аудит на текущем HEAD даёт те же `61`/`960`, гейты перепроверены отдельно. Сводка — [proofs/02-ritual.log](proofs/02-ritual.log).

### Ревью-панель (один прогон)

Роли: reviewer-spec, reviewer-tests, reviewer-code, reviewer-kb — `qwen-token-plan/qwen3.8-flash` @ `xhigh`; модель сессии другая, фолбэков нет, все четыре стартовали одним сообщением.

- **P1 (kb)** — в зелёном прогоне аудит мерил пустой диапазон: `MERGE_BASE` снимался заново после мерж-коммита и совпадал с tip. Исправлено в ритуале: база и tip цели лежат в `.git/FORK_MERGE_BASE`, перезапуск с тем же tip берёт её же; перепрогон печатает дельту. Для этого мержа база восстановлена как merge-base первого родителя merge-коммита.
- **P2 (tests, kb)** — `doc-sync 21/21` приписан ритуалу; ритуал гоняет `test:docs` (doc-quick). Формулировки исправлены, `doc-sync` — носитель тикета 04.
- **P2 (tests, kb)** — ложная фраза «база совпала с tip апстрима». Исправлена; добавлено, что тег rc.5 — предок tip`а.
- **P2 (spec)** — фантомная команда `pnpm run fork-merge-ritual` приписана спеке; она жила в демо-пути тикета 01. Тот исправлен на `scripts/fork-merge-ritual.sh`, отчёт переатрибутирован.
- **P2 (kb)** — zh-пара `ui-conversation` молчала о форк-поведении todo dock после `--write`. Китайские предложения дописаны routine-путём, пара перезаписана и проверена.
- **P2 (kb)** — лог не доказывает «семь конфликтов» и «четыре прогона». Добавлена карта «путь → как снят», честная строка, что логи прогонов 1–3 не сохранены и ход восстановлен по истории.
- **P3** — пустые строки в `SidebarRoot.tsx` после резолва (сняты), строка аудита `conversation.composer.dock` в отчёте, асимметрия merge-коммита по генерируемому каталогу (в «Пробелы»), запись базы в тикете 02 (в «Пробелы»), `web-launcher` закоммичен владельцем (назван), «живая проба тикета 04» переписана как будущая.

Открытых зацепок нет.

- Логи прогонов 1–3 не сохранены; их ход восстановлен по истории коммитов и по тексту ошибок в консоли исполнителя, а не по логу. `proofs/02-ritual.log` — сводка только зелёного прогона.
- Merge-коммит не бывает зелёной точкой бисекта по генерируемому каталогу: фаза docs идёт после коммита, поэтому форк-строки `client-ui-mermaid`/`workspace.session-delete` вернулись в `slot-catalog.ts` только следующим коммитом. Критерий 5 сформулирован «после регенерации» и держится на `HEAD`, а не на merge-коммите.
- Запись базы `dsh-v0.2.2-rc.5` сделана терминальной фазой ритуала здесь, в тикете 02, а не в 04: тикет 04 проверяет записанный файл и не выдаёт запись за своё доказательство.

- Полный `test:gui` не гонялся (`FORK_SKIP_FULL_GUI=1`), replay-лэйн `test:web` и unit-лэйн целиком — тоже: окно регрессии закроют focused-прогоны и живая проба тикета 04 (ещё в работе); пробел называется, а не выдаётся за прогон. Внепланово полный `test:gui` прогнан ревьюером на этом дереве: 820 файлов, 14327 passed / 2 skipped, exit 0 — это независимое доказательство, а не прогон ритуала.
- Push не делался (рамки спеки, команды оператора нет); PR-путь не проверяется.
