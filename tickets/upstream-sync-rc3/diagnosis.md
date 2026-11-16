# Диагностика влияния апстрим-обновления 0.2.2-rc.3 на плагины форка

Отчёт юнита `upstream-sync-rc3`, спека — [docs/plans/upstream-sync-rc3.md](../../docs/plans/upstream-sync-rc3.md).

Отчёт юнита `upstream-sync-rc3`: что меняется в апстриме, какие поверхности используют плагины форка и что из этого ломается. Собран на незамерженном дереве: локальный `master` (90 коммитов от базы прошлого мержа) против `upstream/master` среза 2026-11-16; база прошлого мержа — 2026-11-11. Все проверки — статические, по исходникам обеих сторон; живая проба — работа тикетов исполнения.

## 1. Дельта апстрима

| Метрика | Значение |
|---|---|
| Коммитов апстрима от базы | 448 всего, 309 не-merge |
| Локальные коммиты форка от базы | 90 |
| Версия | `0.2.2-rc.2` → `0.2.2-rc.3` |
| Cordis | `4.0.0-rc.12` (апстрим-гайд `cordis-root-and-intercept-metadata`) |
| Пересечение правленых файлов | 98 |

Пересечение по группам (файлов): ui-workspace 15, ui-sidebar 11, ui-conversation 7, mcp-client 6, session-persistence-jsonl 5, ui-primitives 4, ui-chat 4, api/session-controller 4, apps/web/tests 4, session-query 3, ui-tool 3, ui-subagent 3, ui-user-questions 1, ui-sidebar-right 0. Это прогноз конфликтов, а не список фактов: чистые merge возможны, но правки обеих сторон лежат в одних файлах.

Релевантные апстрим-гайды (`docs/upgrade-guide/v0.2.2-rc.2/` в апстрим-дереве): `client-module-metadata`, `connection-page-peer`, `session-status-package`, `cordis-root-and-intercept-metadata`, `package-export-cleanup`, `shared-search-filter`, `shell-fs-tool-error-codes`.

## 2. Проверенные клиентские контракты (все живы)

| Контракт | Проверка | Итог |
|---|---|---|
| Каталог слотов | `slot-catalog.ts` HEAD 110 имён против апстрима 118 | удалённых нет; +8 |
| `conversation.composer.dock` | есть в обоих каталогах | жив |
| `sidebar.right.pane.tab`, `.title`, `sidebar.panellist` | есть в апстрим-каталоге | живы |
| `ctx.theme.overrideTokens(source, tokens)` | `ui-theme/src/client/index.ts:388` апстрима, сигнатура и disposer те же | без изменений |
| `ctx.locale.register(ns, dicts)` | `locale/src/client/index.ts:403` | без изменений |
| Проекции `tokenUsage`, `contextPressure`, `modelSelection` | grep по апстрим-клиенту | присутствуют |
| `data-*` хуки | 529 (HEAD) против 532 (апстрим) | удалён только `data-composer-stats` (мёртв и до мержа) |
| Верстка узлов чата (`ChatNodeSeat.tsx`) | дифф пуст | хуки `data-chat-flow-kind`, `data-chat-turn`, `data-turn-process-*` на месте |
| Селекторы verify-харнесса (`[data-slot="root"|"sidebar"|"main"]`, `[data-shortcut-modal]`, `[data-row-key]`, `[data-conversation-content]`, `[data-composer-*]`) | grep по апстрим-дереву | все присутствуют |
| Формат строки `dsh web: <url>` | `webserver/entry-url` + Token-провайдер печатает `dsh web: <authenticatedUrl>` | префикс тот же, парсинг токена из лога не ломается |

## 3. Новые UI-элементы, которых нет в классификаторах темы

| Элемент | Источник в апстриме | Что это |
|---|---|---|
| вид узла `inherited-history` | `packages/client/ui-chat/src/client/chat/register-node-renderers.ts`, `MessageItem.tsx` (`InheritedHistoryNodeView`) | разделитель наследованной истории fork-сессии: hairline + подпись с иконкой ветки |
| `data-terminal-banner`, `data-terminal-output`, `data-terminal-prompt`, `data-terminal-state-label` | `packages/client/ui-primitives/src/TerminalBlock.tsx` | размеченные части терминального блока |
| `data-dockkit-pane-body` | `ui-dockkit/src/components/TabLayout.tsx`, `TabPanel.tsx` | тело панели правого сайдбара (носитель для board-вкладки) |
| `data-model-menu`, `data-model-menu-pane` | `ui-agent-team/src/client/TeamModeToggle.tsx`, `ui-model-selection` | меню/панель выбора модели |
| `data-path` | стили модульных ресурсов | атрибут `<style>` вместо снятого `data-plugin-css` |
| слоты `conversation.input.model.pane`, `workspace.picker.directoryFlow`, `sidebar.session.action`, `forge.*` (6) | каталог слотов | новые точки вставки, тема их не классифицировала |

Удалено из апстрима относительно HEAD (форк-local): `data-reply-card`, `data-final-answer`, `data-process-container`, `data-process-surface` — это карточки реплик и контейнер процесса из `transcript-readability`. Тема на эти хуки не опирается; опирается на `data-queue-dock` (37 правил в `styles/tui.css`), который приходит из форк-local `QueueDock.tsx` и обязан выжить в конфликте.

## 4. Матрица плагинов

| Плагин | Установлен в `web`? | Используемые поверхности | Риск мержа | Перечень работ |
|---|---|---|---|---|
| `@local/dsh-omp-theme` (`/home/prog7/home/dev/dsh-plugins/theme-omp`) | да | `theme.overrideTokens`, `slots.register('conversation.composer.dock')`, `locale.register`, проекции, DOM-хуки `styles/tui.css` | средний | переклассифицировать `inherited-history` и терминальные/dockkit/model-menu хуки; снять мёртвые `_version` и `data-composer-stats`; перепроверить каскад после перехода ui-theme на модульные ресурсы; прогнать `verify/inspect.mjs --expected tokens.json`, `contrast.mjs`, `shot.mjs`; пересобрать `client.js` |
| `@dsh-local/view-…` (ontoship-chain-board, `/home/prog7/home/dev/dsh-plugins/ontoship-chain-board`) | нет (запись в `dependencies` профиля, но не в `dsh.profile.bundles`) | `sidebarRightTabs.register`, слоты `sidebar.right.pane.tab(.title)`, `ctx.sidebarRight.openTab/closeIn/openTabs/mounted`, `remote.workspaceFiles.read/list/changes` | вне юнита | удалён из юнита решением оператора 2026-11-16; контракт sidebar-right не менялся, риск — перестройка ui-workspace/ui-sidebar |
| `@local/dsh-omp-demo-panel` | да | `sidebarRight` | низкий | живая проба открытия/закрытия панели |
| `ontoship-team`, `ontoship-team-1c`, `dsh-1c-contour` | да | Host-пресеты, `cordis.patch.yml`, skills/commands | пропущены | в разработке, вне юнита (решение оператора 2026-11-16); `engines.dsh >=0.2.2-rc.2 <0.3.0` покрывает rc.3, `tools.register` не менялся |
| `@local/dsh-web-search-zai` (`packages/fork/web-search-zai`) | нет (ни один профиль его не выбирает) | `ctx.web` провайдеры, `dsh-credentials`, `dsh-web-fetch-http`, MCP client | вне юнита | удалён из юнита решением оператора 2026-11-16; `web/src/types.ts` без диффа, коды `WebError` те же |
| `@local/dsh-ui-refinement` | нет | — | мёртв | в план не входит (решение оператора 2026-11-16); `remote.account` в апстриме переписан на `webserver/request` |
| `@local/dsh-fin-agent` | нет | `slots.register('main')`, `'sidebar.panellist'`, `sessions` | мёртв | удалён оператором; каталог на диске — остаток, не входит |

`headless` и `sdk` профили внешних плагинов не грузят (только `@deepseek-ai/dsh-base` + свой бандл).

## 5. Конфигурация профиля `web`

Все ключи патч-слоя живы в rc.3: `llm-pi-ai` (провайдеры, `compat.*`, `reasoningEfforts` — диффа по схеме нет), `permission-presets` (`presets`, `defaultPreset`; изменился только `CommandDefinitionId` на `brandString`), `ui-theme` (`preference`, `fontSize`), `ui-settings-general` (`welcomeNoticeVersion`), `ui-theme` CSS-инсталляция переписана. Бандлы профиля существуют в апстриме: `dsh-base`, `dsh-web-app`, экспериментальные `session-titles`, `tool-worktree`, `inspector-profile`, `forge-bundle`, `auto-review`, `plugin-market-bundle`, `personalized-recommendations`; `dsh-tool-cordis` есть. `dsh-client-ui-session-status` добавлен в `dsh-web-app` — новые индикаторы статуса сессий (ui-session больше не владеет `useSessionStatus`); внешние плагины профиля этот хук не читают.

## 6. Изменения, требующие внимания в UI-плагине

1. `ui-theme` больше не вставляет собственные `<style data-plugin-css>` при apply: CSS стал модульными ресурсами и ставится рендерером при монтировании. Собственный `<style data-plugin="@local/dsh-omp-theme">` темы теперь конкурирует по порядку каскада с базовым CSS, а не с ним же, вставленным раньше, — проверять computed-стили, не глазами.
2. Схема имён CSS-модулей статических либ: `_<local>_<hash>_<line>` → `<hash>_<local>` (гайд `client-module-metadata`). Селекторы темы вида `[class*='_markdown']` (без завершающего `_`) выживают в обеих схемах; проверено по локальным именам модульных CSS апстрима: не найдено только `_version` (мёртвое правило сайдбара).
3. HMR: рукописные бандлы (этот) продолжают ставить style-теги сами; Modules больше не снимает чужие теги при выключении/замене. Собственный disposer темы тег снимает — регресс возможен только если порядок применения изменит рендерер.
4. Новый вид узла `inherited-history` рисуется дефолтным DSH-стилем, пока тема его не классифицирует.

## 7. Гейты, которые упадут без правок

- `verify-doc-budgets`: корневой `AGENTS.md` держит 2080/2080; апстрим добавил ссылку `([checker](scripts/verify-empty-catch.ts))` в правило про пустой `catch`. Нужен condense или relocate до/после мержа.
- `gen-doc-graphs`, `gen-config-catalog`, `gen-tsconfig-paths`: генерённые артефакты, политика ритуала — сторона апстрима плюс перегенерация.
- `verify-translation-pairing`: пары каталожных доков перезаписываются ритуалом; `docs/plans/` и форк-оверлей из пейринга исключены.
## 8. Итоги прогона после мержа (2026-11-16)

Мерж апстрима (2026-11-16): 23 конфликта, 3263 изменённых файла. Агрегатные чек-тайпы упали на трёх тестах, где смешались стили обеих сторон (`ToolCallId`/`SessionId` как значения при type-импорте, `@deepseek-ai/dsh-llm/brand`): переведено на `brandString` и корневой экспорт. `constraints` падал на остатках `packages/experimental/ptc-runtime-python` — снято `pnpm run clean` (402 пути).

`test:docs` 21/21 после перезаписи шести README-пар и выравнивания эталонной пары `session-persistence-jsonl` (184/184): в zh добавлен абзац про `delete(id)`, в en список меню совмещён (pin/rename/read-unread/fork/copy/archive/delete).

`test:snapshot` под Node 24 — 268 passed, 2 skipped, 0 failed. Под Node 22 краснели `esm_denied`, `esm_static`, `esm_dynamic` с «PTC importHandler supports evaluation-phase imports only»: у `vm.Module` в Node 22 нет аргумента `phase`. Ритуал теперь сам добавляет Node 24 в PATH (`NODE_BIN_DIR`).

Живая проба на изолированном Host `:3081` (`DSH_HOME=/tmp/dsh-verify-3081`): computed-токены 654/654 совпали, контраст 92/92 PASS, скриншоты обеих схем сняты и прочитаны, консоль без новых ошибок. Свежий home показывает онбординг «Get started» блокирующей модалкой — проба требует перенесённых кредов и `state/`.

Классификатор темы: `verify/surfaces.json` — 137 элементов (17 видов узла чата, 40 с лишним хуков, 12 слотов), `verify/classify.mjs` даёт `classify: OK`; негативный тест подтверждён (снятый вид → `NEW`, выдуманный хук → `MISSING`, exit 1). В CSS добавлены правила для `inherited-history` и терминальных `banner`/`prompt`/`output`/`state-label`, снят мёртвый `_version`; `client.js` пересобран (172 589 байт, smoke 64/64). Проверка живой страницы: подпись разделителя и терминальные подписи — 12px/11px tertiary, prompt — акцент, output — #928374.

Пробелы закрыты вторым заходом 2026-11-16: изолированный home получил копию `storages/` и записанных сессий рабочего пространства `deepseek-harness`. Живой ход на `:3081` (маршрут Qwen4 Max preview) отрисовал карточку ответа, markdown-таблицу и строку «Completed in 19s»; `omp-demo-panel` сам открыл демо-страницу темы в правой панели (вкладка `index.html`, палитра gruvbox) — эффект `sidebarRight.openResource` работает на смерженном билде. Записанная сессия «Проверка обновлений апстрима dsh» открылась в транскрипте: 32 карточки инструментов, карточки реплик, чипы кода, разделители «Completed in», футеры usage. Скриншоты: [01-live-turn-dark.png](proofs/01-live-turn-dark.png), [02-recorded-transcript-dark.png](proofs/02-recorded-transcript-dark.png), [03-recorded-transcript-tail-dark.png](proofs/03-recorded-transcript-tail-dark.png), тема — [04-theme-default-dark.png](proofs/04-theme-default-dark.png), [05-theme-settings-light.png](proofs/05-theme-settings-light.png).

Остаточный пробел: строка `inherited-history` появляется только в fork-сессии, живой записи нет; её правило проверено на синтетическом узле и классификатором.
