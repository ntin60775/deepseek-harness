# Тикет 04 — Гейты, живая проба, база

Блокеры: 03 (профиль запинен до пробы и записи базы).
Спека: [docs/plans/upstream-sync-rc5.md](../../docs/plans/upstream-sync-rc5.md), пункты «Готово» 5–8.
Гейт проекций: [projections.md](projections.md) (находки 9–20, 29–34).

## Демо-путь

Лайт-контур зелёный, второй экземпляр интерфейса на `:3081` открывается с копией профиля: композер, страница Plugins и Settings работают, страница ревью forge открывается (список пуст без привязанного workspace), обе схемы сняты; занятость слота `conversation.composer.dock` виджетом темы подтверждает `cordis_inspect` с `:3080` — в пробе `:3081` виджет не материализуется без законченной Conversation; `packages/fork/upstream-base.json` несёт `dsh-v0.2.2-rc.5`, доки форка и состояние проекта обновлены.

## Критерии приёмки (падают на базовом коммите)

1. **Контур.** Артефакт: вывод `pnpm run build`, `pnpm run typecheck`, `pnpm run constraints`, `pnpm run test:docs`, `pnpm run doc-sync`. Ожидание: все зелёные; `doc-sync` включает каталоги, которых нет в doc-quick. На базе: инвариант; краснеет на регенерации после мержа.
2. **Снапшоты.** Артефакт: `node -v` и `pnpm run test:snapshot`. Ожидание: Node 24 в выводе, все сценарии прошли или пропущены по своим причинам, падений нет. На базе: под Node 22 падают PTC-сценарии.
3. **Focused.** Артефакт: прогоны по списку спеки — `ui-chat`, `ui-conversation`, `ui-sidebar`, `ui-subagent`, `ui-mermaid`, `ui-theme`, `ui-sidebar-documentpreview`, `ui-deliverables`, `ui-account-notifications`, `connection`, `ui-settings-models`, `shortcuts`, `extensions/cordis-client-runner`, `fork/web-search-zai`, `bundle/base`, `mcp-client`, `session-persistence-sqlite`, `sandbox-policy`, `worktree`. Ожидание: зелёные; `pnpm run fork:invariants` зелёный. На базе: инвариант; краснеют при регрессии форк-поверхностей.
4. **Классификатор темы.** Артефакт: `node ~/home/dev/dsh-plugins/theme-omp/verify/classify.mjs --checkout $PWD --strict`. Ожидание: exit code 0; каждый `NEW` имеет решение в отчёте. На базе: инвариант.
5. **Живая проба.** Артефакт: лог старта, HTTP-код, скриншоты, `cordis_inspect_query`. Ожидание: `DSH_HOME=/home/prog7/.dsh-probe` той же глубины с `node_modules`; HTTP 200 на `:3081`; в логе нет `skipping profile bundle` и `patch: ... not found`; слот `conversation.composer.dock` занят виджетом темы; экраны шапки, композера, Plugins, Settings, `omp-demo-panel` и страницы ревью forge прочитаны в обеих схемах. На базе: второго инстанса нет.
6. **База.** Артефакт: `packages/fork/upstream-base.json`. Ожидание: `{tag: "dsh-v0.2.2-rc.5", mergedAt: "2026-11-19"}` или дата фактического прогона; sha нет. На базе: записан `dsh-v0.2.2-rc.4`.
7. **Доки и KB.** Артефакт: дифф [docs/ops/fork-upgrade.md](../../docs/ops/fork-upgrade.md), [docs/reference/fork-merge-ritual.md](../../docs/reference/fork-merge-ritual.md), [packages/fork/README.md](../../packages/fork/README.md), [.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md), [docs/ops/continue.md](../../docs/ops/continue.md) + `gitmark index`, `gitmark lint --strict`, `gitmark map -o docs-map.html`. Ожидание: диапазон от merge-base, новый генерируемый конфликт и флаг лайт-контура описаны; lint без `ERR`. На базе: доки описывают прежний диапазон.

## Охранники

- `:3080` не рестартится и не гасится; правка профиля доезжает HMR-ом.
- Копия `DSH_HOME` не несёт сессий, баз и credentials основного дома.
- Полный `test:gui`, replay `test:web` и unit-лэйн целиком не гоняются — пробел назван в отчёте, а не выдан за прогон.
- Push не делается.

## Примечания исполнения

- Копия профиля: `package.json`, `cordis.yml`, `cordis.patch.yml`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `node_modules`; относительные симлинки `link:` ломаются при другой глубине `DSH_HOME`.
- Сообщение `failed to load` клиентское и критерием старта не является; критерий — exit code и отсутствие двух строк про bundle и patch.
- Отчёт доказательств — в этот файл; скриншоты — `tickets/upstream-sync-rc5/proofs/`.

## Отчёт исполнения (2026-11-19)

### Гейты лайт-контура

- **Build.** `pnpm run build` — 10/10 гейтов зелёные в зелёном прогоне ритуала (сводка в [proofs/02-ritual.log](proofs/02-ritual.log)). Перепрогон на финальном HEAD оператор запретил («пересборку не делай, я сам запущу») — пробел назван, не выдан за прогон. Остальные гейты перепроверены на финальном HEAD после `fix(ui-mermaid)` ([proofs/04-gates.log](proofs/04-gates.log)).
- **Typecheck.** `pnpm run typecheck` — 5/5 зелёные на HEAD после мержа ([proofs/04-gates.log](proofs/04-gates.log)).
- **Constraints.** `pnpm run constraints` — exit 0 ([proofs/04-gates.log](proofs/04-gates.log)); версия форк-пакета `ui-mermaid` выровнена на `0.2.2-rc.5`.
- **Доки.** `pnpm run test:docs` — 21/21, `pnpm run doc-sync` — 43/43 ([proofs/04-gates.log](proofs/04-gates.log)).
- **Снапшоты.** Node `v24.19.0`; `pnpm run test:snapshot` — 276 passed / 2 skipped на HEAD после `fix(ui-mermaid)`, падений нет ([proofs/04-gates.log](proofs/04-gates.log)). `ui-mermaid` focused — зелёный ([proofs/04-focused-uimermaid.log](proofs/04-focused-uimermaid.log)).
- **Focused.** GUI-пакеты (`ui-chat`, `ui-conversation`, `ui-sidebar`, `ui-subagent`, `ui-mermaid`, `ui-theme`, `ui-sidebar-documentpreview`, `ui-deliverables`, `ui-account-notifications`, `connection`, `ui-settings-models`, `shortcuts`, `extensions/cordis-client-runner`) — 350 файлов / 5138 тестов зелёные; юнит-пакеты (`fork/web-search-zai`, `bundle/base`, `mcp-client`, `session-persistence-sqlite`, `sandbox-policy`, `worktree`) — 59 файлов / 806 тестов зелёные ([proofs/04-focused-gui.log](proofs/04-focused-gui.log), [proofs/04-focused-unit.log](proofs/04-focused-unit.log)); `pnpm run fork:invariants` — 27/27.
- **Классификатор темы.** `node ~/home/dev/dsh-plugins/theme-omp/verify/classify.mjs --checkout $PWD --strict` — exit 0, `classify: OK` (254 элемента; два новых слота `forge.review.conversation` и `sidebar.panellist.trailing` классифицированы `inherits-dsh` в тикете 02).

### Живая проба

`DSH_HOME=/home/prog7/.dsh-probe pnpm dsh web --port 3081 --no-open` (Node 24): HTTP 200 по cookie, `401` без launch-токена, в логе старта нет `skipping profile bundle` и `patch: ... not found`, заголовок UI — `0.2.2-rc.5` ([proofs/04-probe.log](proofs/04-probe.log)). `:3080` не рестартился и не гасился; живой профиль запинен; правку профиля перечитывает `dsh-hmr` из base (ключ `patchReload` в дереве не читается и удалён из профиля).

Экраны прочитаны глазами (скриншоты в `proofs/`): шапка сеанса и тоггл панели сеанса (`04-probe-session-dark.png`, `04-probe-session-panel-dark.png`), композер (`04-probe-session-dark.png`), страница Plugins (`04-probe-plugins-dark.png`), Settings → Web search and fetch с выбранным DeepSeek Search API (`04-probe-settings-websearch-dark.png`) — тёмная схема; Settings General (`04-probe-settings-general-light.png`), карточка `@local/dsh-omp-demo-panel` (`04-probe-omp-demo-panel-light.png`), страница ревью forge (`04-probe-forge-review-light.png`) и карточка change request (`04-probe-forge-card-light.png`) — светлая. Схемы распределены по экранам, а не дублированы для каждого: обе проверены, поэкранный паритет не заявляется. Виджет темы в composer dock на `:3081` не материализуется (нет законченной Conversation), поэтому носитель критерия 5 для слота — `cordis_inspect` с `:3080`, а не проба. Слот `conversation.composer.dock` снят `cordis_inspect` (client `Slots.listSubTree`): слот существует, занят записями `status-line`, `activity`, `usage` темы — [proofs/04-cordis-inspect-slot.json](proofs/04-cordis-inspect-slot.json); снято с живого клиента `:3080`, потому что проба `:3081` без законченной Conversation виджет не материализует, — это названо в пробелах ниже.

**Пробелы пробы, названные явно.** В копии `DSH_HOME` нет credentials и сессий, поэтому законченной Conversation не создать: виджет темы в composer dock не материализуется, а `omp-demo-panel` открывается только на `data-content-phase="active"`. Экран `omp-demo-panel` проверен как карточка плагина; страница ревью forge открыта, но список пуст: карточка PR отвечает «The change request does not exist or you cannot access it» и «Pull requests are disabled for this repository» — у пробы нет workspace, привязанного к репозиторию. Оба пробела — следствие изоляции пробы, а не мержа. На `:3081` снять `cordis_inspect` нельзя: инструмент смотрит текущий хост `:3080`, а проба — отдельный процесс. Слот снят с `:3080` (`status-line`, `activity`, `usage`), в самой пробе занятость слота не подтверждена — статическое подтверждение даёт аудит тикета 02 (`ok conversation.composer.dock`).

### База и доки

- `packages/fork/upstream-base.json` — `{ "tag": "dsh-v0.2.2-rc.5", "mergedAt": "2026-11-19" }`; запись сделана терминальной фазой ритуала в тикете 02, здесь проверена.
- Обновлены [docs/ops/fork-upgrade.md](../../docs/ops/fork-upgrade.md), [docs/reference/fork-merge-ritual.md](../../docs/reference/fork-merge-ritual.md), [packages/fork/README.md](../../packages/fork/README.md), [.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md) и [docs/ops/continue.md](../../docs/ops/continue.md): диапазон от merge-base, персистентность базы, staged-пары, `FORK_SKIP_FULL_GUI`, новые фазы и состояние rc.5.
- KB (после финального коммита): `gitmark index` — 1641 файл / 26300 чанков / 8800 ссылок; `gitmark lint --strict` — чисто; `gitmark map` — 1641 файл, 0 вне индекса.

### Пробелы контура

- Полный `test:gui` ритуалом не гонялся (`FORK_SKIP_FULL_GUI=1`); внеплановый полный прогон ревьюера на дереве финального мерж-форварда mermaid — 14327 passed / 2 skipped, exit 0 ([tickets/mermaid-viewer-scale-zoom/proofs/03-test-gui.log](../mermaid-viewer-scale-zoom/proofs/03-test-gui.log)). Replay-лэйн `test:web` и unit-лэйн целиком не гонялись.
- Пересборка на финальном HEAD не запускалась — по указанию оператора; build 10/10 зафиксирован в зелёном прогоне ритуала.
- Push не делался (рамки спеки).
- Апстримная Agent Note `.agents/notes/implemented/architecture/2026-08-22-single-dsh-application-launcher.md` всё ещё описывает `patchReload` как shipped-механизм; это upstream-запись решения, в юните не правилась — зацепка на следующий sweep, в отчётах юнита механизм назван по коду (`dsh-hmr`).

### Ревью-панель (один прогон)

Роли: reviewer-spec, reviewer-tests, reviewer-code, reviewer-kb — `qwen-token-plan/qwen3.8-flash` @ `xhigh`; модель сессии другая. `rev-code-04` упал без результата, повторная проба `rev-code-04b` отработала.

- **P2 (tests, spec)** — не было носителя `cordis_inspect` по слоту `conversation.composer.dock` и противоречивая фраза о нём. Слот снят client `Slots.listSubTree` с `:3080` (`status-line`, `activity`, `usage`), [proofs/04-cordis-inspect-slot.json](proofs/04-cordis-inspect-slot.json); в отчёте сказано, что на `:3081` снять нельзя, а проба виджет не материализует.
- **P2 (tests, spec)** — скриншот forge был подписан `-dark`, хотя снят в светлой схеме; переименован в `-light`, поэкранное распределение схем названо.
- **P2 (spec)** — команда песочницы и `grep` в тикете 03 были нерабочими; форма исправлена, лог получил шапку команды и `exit=0`, `grep -E` переписан, baseline схемы приложен.
- **P2 (kb, code)** — механизм HMR назван мёртвым `patchReload: live`. Отчёт и спека юнита переписаны на `dsh-hmr` из base (решение оператора 2026-11-19); ключ удалён из живого профиля и копии.
- **P2 (kb, code)** — `continue.md` не отражал юнит и gates; добавлена строка юнита и ссылка на его спеку/отчёт; `packages/fork/README.md` получил `slot-catalog.ts` и `FORK_SKIP_FULL_GUI`.
- **P2 (code)** — Agent Note пересказывала фазы reference-документа и неточно ставила запись базы; аудит выделен в отдельную фазу, запись базы — после зелёных гейтов, до actions/commit.
- **P3** — лог `04-gates.log` назван «финальный HEAD» до последнего `fix(ui-mermaid)`: гейты перепрогнаны на текущем HEAD, заголовок уточнён; demo-путь и README step 6 исправлены; ссылка `continue.md` ведёт на отчёт 04 и спеку.

Открытых зацепок нет; upstream Agent Note про `patchReload` остаётся зацепкой следующего sweep (upstream-запись решения, в юните не правилась).
