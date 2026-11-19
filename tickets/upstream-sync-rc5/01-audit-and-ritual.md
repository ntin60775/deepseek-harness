# Тикет 01 — Аудит диапазона и ритуал

Блокеры: нет.
Спека: [docs/plans/upstream-sync-rc5.md](../../docs/plans/upstream-sync-rc5.md), пункты «Готово» 1 и 2.
Гейт проекций: [projections.md](projections.md) (юнит-уровень; находки 1–5, 7–8, 19–21, 24–28 учтены).

## Демо-путь

`pnpm run fork:upgrade-audit --target upstream/master` до мержа печатает честную дельту: `238 коммитов (мерджей 99)`, пересечение `61` при «апстрим изменил 960», гайды `3 новых + 1 изменённый`, и в шапке — записанный тег, его коммит и признак «влит в HEAD». Тот же отчёт после мержа с переданным `--base` из ритуала показывает то же, а без `--base` — «влит полностью». `FORK_SKIP_FULL_GUI=1 scripts/fork-merge-ritual.sh` проходит фазу verify без полного `test:gui` и печатает названную подмену.

## Критерии приёмки (падают на базовом коммите)

1. **Диапазон.** Артефакт: вывод `pnpm run fork:upgrade-audit --target upstream/master`. Ожидание: `238 коммитов (мерджей 99)`, `файлов пересечения 61`, строка «апстрим изменил 960», `гайдов 3 новых + 1 изменённый`, шапка `база: <merge-base>`, `записанный тег: dsh-v0.2.2-rc.4 = <коммит>`, `влит в HEAD: да`. На базе: 1645 коммитов, 5818 файлов, 44 строки гайдов, шапка без тега.
2. **Параллельный тег.** Артефакт: fixture-кейс спеки. Ожидание: при теге, который не влит в HEAD и несёт гайд только в своей линии, база — merge-base, предупреждение называет число скрытых коммитов и гайдов. На базе: такого пути нет, тег вне HEAD не проверяется.
3. **После мержа.** Артефакт: кейс «target уже в HEAD» + ветка передачи `--base` в скрипте ритуала. Ожидание: без `--base` отчёт говорит «влит полностью» и печатает нули; с `--base`, снятым до мержа, — дельту. На базе: ритуал вызывает аудит без `--base`, отчёт после мержа пуст.
4. **Спека скрипта.** Артефакт: `pnpm run test -- scripts/fork-upgrade-audit.spec.ts`. Ожидание: зелёная; кейсы «тег — предок merge-base», «тег совпадает», «параллельный тег», «`--base` при записанном теге», «нет файла/нет тега/битая ревизия», «после мержа», «`--record-base` пишет `tag` и `mergedAt` и не пишет sha», property «`base` — предок HEAD». На базе: у скрипта нет экспортов, спеки нет, кейсы красные.
5. **Записанная база.** Артефакт: fixture-кейс + `packages/fork/upstream-base.json`. Ожидание: файл несёт `{tag, mergedAt}` без sha; при теге вне HEAD `--record-base` предупреждает; без флага файл не трогается. На базе: предупреждения нет, поведение не покрыто.
6. **Ритуал.** Артефакт: дифф `scripts/fork-merge-ritual.sh`. Ожидание: `slot-catalog.ts` в `GENERATED_CONFLICTS`; `verify-translation-pairing --write` по конфликтным парам до `git commit --no-edit`; `MERGE_BASE` снимается до мержа; `FORK_SKIP_FULL_GUI=1` пропускает строку `test:gui` и печатает подмену; комментарий про third-party notices заменён настоящей причиной (pi-ai metadata job). На базе: ни одного из пяти.
7. **Доки ритуала.** Артефакт: `pnpm run test:docs`. Ожидание: зелёный после обновления [docs/ops/fork-upgrade.md](../../docs/ops/fork-upgrade.md) и [docs/reference/fork-merge-ritual.md](../../docs/reference/fork-merge-ritual.md) (флаг, диапазон, генерируемый конфликт). На базе: доки описывают только тег-диапазон и не знают флага.

## Охранники

- `--base` остаётся приоритетнее тега и merge-base.
- Отсутствие тега и битая ревизия — fallback на merge-base с сообщением, не падение.
- Без флага ритуал по-прежнему гоняет полный `test:gui`; флаг не меняет остальные фазы.
- `--record-base` пишет только `{tag, mergedAt}`; sha в файле остаётся запрещён.
- Числа в спеке скрипта берутся из fixture, не из живого репозитория.

## Примечания исполнения

- Образец рефакторинга — [scripts/change-scope.ts](../../scripts/change-scope.ts): экспорт `renderAudit(args, root)` плюс тонкий CLI-guard; `ROOT` и `BASE_FILE` становятся параметрами.
- `git merge-base --is-ancestor` трёхзначен (0 — предок, 1 — нет, 128 — битая ревизия); `execFileSync` бросает на 1, поэтому нужен `spawnSync`.
- Отчёт тикета не содержит sha из вывода аудита — только тег и числа (запрет `verify-repository-references`).
- Отчёт доказательств — в этот файл; логи — `tickets/upstream-sync-rc5/proofs/`.
## Отчёт исполнения (2026-11-19)

### Что сделано

- `scripts/fork-upgrade-audit.ts` вынесен в `renderAudit(args, root)` с тонким CLI-guard по образцу `scripts/change-scope.ts`; `ROOT` и путь базы стали параметрами. База — всегда `--base` или `merge-base(HEAD, target)`; инвариант «`base` — предок `HEAD`» проверяется `spawnSync` и падает громко. Записанный тег печатается отдельными строками `записанный тег: <tag> = <commit>` и `влит в HEAD: да/нет`; тег вне HEAD даёт предупреждение с числом скрытых коммитов и списком guide.md (`rev-list --count HEAD..<tag>`, `diff --name-status HEAD <tag> -- docs/upgrade-guide`). Строка пересечения печатает `файлов пересечения <n>; апстрим изменил <net diff>`, гайды — `гайдов <A> новых + <M> изменённый`. `--record-base` пишет ближайший влитый в цель тег и `mergedAt`, предупреждает при теге вне HEAD, sha в файл не пишет. Скрытые гайды считаются только по `--diff-filter=A` — гайд, который есть в HEAD и отсутствует в теге, не «скрыт». `--strict` бросает `AuditProblemsError` с полным отчётом внутри, CLI печатает отчёт в stdout перед строкой ошибки, exit code остаётся 1. `renderAudit` принимает home третьим параметром: внешние плагины и профили читаются из переданного дома, fixture не зависит от машины оператора.
- `scripts/fork-merge-ritual.sh`: `MERGE_BASE` снимается до мержа и передаётся аудиту через `--base`; `slot-catalog.ts` добавлен в `GENERATED_CONFLICTS`; устаревшие пары `README.md`/`README.i18n.yaml` перезаписываются `verify-translation-pairing --write` до `git commit --no-edit`: кандидаты — staged-записи `README.i18n.yaml`, `--write` идёт только по тем, что гейт назвал stale (это же чинит чистый мерж, упавший на pre-merge-commit); флаг `FORK_SKIP_FULL_GUI=1` пропускает полный `test:gui` и печатает названную подмену; объяснение `pnpm install` до коммита заменено на настоящую причину — pre-commit job «pi-ai provider metadata» сверяет staged `pnpm-lock.yaml` с установленным графом.
- Доки: `docs/ops/fork-upgrade.md` (диапазон от merge-base, тег как отметка линии, перезапись пар, флаг лайт-контура, запись базы), `docs/reference/fork-merge-ritual.md` (фазы по порядку скрипта, `--base`, `FORK_MERGE_CONFLICTS`, генерируемый `slot-catalog.ts`, причина install, флаг).

### Критерии приёмки

1. **Диапазон.** `node --import tsx/esm scripts/fork-upgrade-audit.ts --target upstream/master`: `238 коммитов (мерджей 99)`, `файлов пересечения 61`, `апстрим изменил 960`, `гайдов 3 новых + 1 изменённый`, шапка `база: <commit>`, `записанный тег: dsh-v0.2.2-rc.4`, `влит в HEAD: да`. Вывод — [proofs/01-live-audit.log](proofs/01-live-audit.log); коммиты заменены на `<commit>`, тег и числа сохранены (запрет `verify-repository-references`).
2. **Параллельный тег.** Спека `scripts/fork-upgrade-audit.spec.ts`, кейс «names commits and guides hidden behind an unmerged release tag»: база — merge-base, предупреждение `за базой скрыто 1 коммит и 1 guide.md`, путь гайда в выводе.
3. **После мержа.** Кейс «reports a fully merged upstream and the delta behind a passed --base»: без `--base` — `апстрим влит полностью` и нули, с базой, снятой до мержа, — дельта; ветка передачи `--base "$MERGE_BASE"` — в диффе ритуала.
4. **Спека скрипта.** `node_modules/.bin/vitest run scripts/fork-upgrade-audit.spec.ts` — 12/12 зелёные, лог [proofs/01-audit-spec.log](proofs/01-audit-spec.log). Кейсы: тег — предок merge-base, тег совпадает с merge-base, параллельный тег с гайдом только в нём (гайд, который есть в HEAD и нет в теге, в скрытые не попадает), `--base` при записанном теге, нет файла/нет тега/битая ревизия, `tag: null`, после мержа, `--record-base` и неизменность файла без флага, property «base — предок HEAD», счётчик новых и изменённых гайдов, `--strict` с полным отчётом в ошибке. Числа — из fixture. Краснота на базе и мутация: [proofs/01-base-red.log](proofs/01-base-red.log) — старый скрипт даёт `1645` коммитов и падает на сборе спеки; [proofs/01-mutation-tag-base.log](proofs/01-mutation-tag-base.log) — мутация «диапазон от записанного тега» роняет 5 кейсов.
5. **Записанная база.** Fixture-кейс: `--record-base` пишет `{tag, mergedAt}` без sha, предупреждает при теге вне HEAD, без флага файл не трогается. Живой `packages/fork/upstream-base.json` не менялся — запись базы делает тикет 04 после мержа.
6. **Ритуал.** Дифф `scripts/fork-merge-ritual.sh`: `slot-catalog.ts` в `GENERATED_CONFLICTS`; перезапись пар до `git commit --no-edit` через `finish_merge_commit`; `MERGE_BASE` до мержа + `--base` в аудите; `FORK_SKIP_FULL_GUI=1` с печатью подмены; комментарий про pi-ai metadata. Якорь пары из staged-записи: `README.i18n.yaml` даёт `README.md` — [proofs/01-pair-anchor.log](proofs/01-pair-anchor.log) (фрагмент цикла из скрипта на четырёх парах дерева rc.5). `bash -n scripts/fork-merge-ritual.sh` — чисто.
7. **Доки ритуала.** `pnpm run test:docs` — 21/21 зелёные после правки обоих документов.

### Проверки

- `node_modules/.bin/vitest run scripts/fork-upgrade-audit.spec.ts` — 12/12, 1.4 с ([лог](proofs/01-audit-spec.log)).
- `pnpm run typecheck` — 5/5 зелёные ([лог](proofs/01-typecheck.log)).
- `pnpm run test:docs` — 21/21 ([лог](proofs/01-test-docs.log)).
- `oxlint` по двум изменённым скриптам — 0 ошибок.
- `bash -n scripts/fork-merge-ritual.sh` — чисто.

### Пробелы

- Прогон ритуала целиком на тикете не делался: первый настоящий вызов — мерж тикета 02, где и проверяются `MERGE_BASE`/`--base`, перезапись пар и флаг. На тикете поведение закрыто диффом, `bash -n` и fixture-кейсами спеки.
- Полный `test:gui` не гонялся — решение оператора о лайт-контуре; GUI-доказательства несёт тикет 04.
- Случайный полный unit-прогон (фильтр после `--` не сработал) дал 47 падений в чужих пакетах; падения воспроизводятся в linked worktree и на локали: например, `worktree/tests/sandbox.spec.ts` ждёт английский текст git, а получает русский. К тикету не относятся, в нём не чинились.
- Команда-носитель из спеки `pnpm run test -- scripts/fork-upgrade-audit.spec.ts` фильтр не пробрасывает: pnpm 11 отдаёт `vitest run -- <файл>`, и Vitest гонит весь набор. Рабочая форма — `pnpm exec vitest run scripts/fork-upgrade-audit.spec.ts` (или прямой бинарь vitest).
- CLI-guard (`argv` → `renderAudit`, exit code, stderr-префикс) отдельным тестом не покрыт: скрипт резолвит `ROOT` от своего каталога, поэтому fixture-репозиторий через CLI не проверить без подмены корня. Паттерн унаследован от `scripts/change-scope.ts`; `--strict`-ветка теперь покрыта через ошибку с отчётом.

### Ревью-панель (2026-11-19, один прогон)

Роли: reviewer-spec, reviewer-tests, reviewer-code, reviewer-kb — `qwen-token-plan/qwen3.8-flash` @ `xhigh`; маршрут сверен с живым каталогом, модель сессии другая (`deepseek-v4.1-flash-1017`), фолбэков нет; все четыре роли стартовали одним сообщением (лимит детей 4).

Исходы, по одной строке:

- **P1 (code)** — якорь пары из `README.i18n.yaml` терял `.md`, и `ui-sidebar`/`ui-subagent` не попадали в перезапись. Исправлено; механизм переведён на staged-записи: кандидаты — staged `README.i18n.yaml`, `--write` только по тем, которые гейт назвал stale. Заодно закрывает чистый мерж, упавший на pre-merge-commit.
- **P1 (code)** — `--strict` бросал ошибку и терял отчёт. Теперь `AuditProblemsError` несёт отчёт, CLI печатает его в stdout перед строкой ошибки, exit code 1; кейс в спеке.
- **P2 (code)** — `hiddenGuides` считал `D`-строки обратного направления. `--diff-filter=A`; кейс «гайд есть в HEAD и нет в теге».
- **P2 (code)** — home в шве тестируемости. `renderAudit(args, root, home)`; спека изолирована от машины, JSDoc описывает `home`.
- **P2 (tests)** — не было red-base, mutation и живого лога. Добавлены `proofs/01-base-red.log` (старый скрипт: `1645` коммитов и 12 падений спеки), `proofs/01-mutation-tag-base.log` (мутация «диапазон от тега» роняет 5 кейсов), `proofs/01-live-audit.log` (числа критерия 1, коммиты заменены на `<commit>`).
- **P2 (tests)** — у критерия 1 не было места осмотра. Закрыт `proofs/01-live-audit.log`.
- **P2 (tests)** — спека зависела от живого home. Изоляция через `home` + `DSH_FORK_PLUGIN_DIRS`; 12/12.
- **P2 (kb)** — reference неверно называл источник конфликтов у резолвера. Фраза исправлена; после перевода перезаписи на staged-записи переписана ещё раз и сходится с кодом.
- **P2 (spec)** — `packages/fork/README.md` поправлен здесь, хотя спека п.8 отдаёт файл тикету 04. Оставлено сознательно: README утверждал старую семантику диапазона сразу после её отмены; остальной текст README (описание протокола) обновит тикет 04 по спеке. Остальные правки тикета 04 не тронуты.
- **P2 (spec)** — Agent Note не в этом коммите, хотя протокол форка требует его при изменении `GENERATED_CONFLICTS`. Отсрочено явно на тикет 04 (спека п.8, пункт «Доки и KB»); note описывает фазы ритуала и обновится вместе с `packages/fork/README.md`.
- **P3** — кейс `tag: null` добавлен; JSDoc `section` исправлен; формы гайдов через `plural`; `printf` цитирован; файл конфликтов снят вместе с механизмом; команда-носитель `pnpm run test -- …` не фильтрует — рабочая форма названа в «Пробелах»; CLI-guard остаётся без прямого теста — пробел назван, ишью не заводится (скрипт резолвит `ROOT` от своего каталога, fixture-прогон через CLI невозможен).

Открытых зацепок нет.
