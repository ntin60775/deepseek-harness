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
| `@dsh-local/view-…` (ontoship-chain-board, `/home/prog7/home/dev/dsh-plugins/ontoship-chain-board`) | да | `sidebarRightTabs.register`, слоты `sidebar.right.pane.tab(.title)`, `ctx.sidebarRight.openTab/closeIn/openTabs/mounted`, `remote.workspaceFiles.read/list/changes` | средний | контракт sidebar-right не менялся (дифф 8 файлов — shell/shortcuts); риск в перестройке ui-workspace/ui-sidebar и `data-dockkit-pane-body`; прогнать тесты пакета и живую пробу вкладки |
| `@local/dsh-omp-demo-panel` | да | `sidebarRight` | низкий | живая проба открытия/закрытия панели |
| `ontoship-team`, `ontoship-team-1c` | да | Host-пресеты, `cordis.patch.yml`, skills/commands | низкий | `engines.dsh >=0.2.2-rc.2 <0.3.0` покрывает rc.3; `tools.register` не менялся; preset/commands диффнулись (13/9 файлов) — прогнать `vitest` пакетов |
| `dsh-1c-contour` (`/home/prog7/home/dev/personal/1C-DSH`) | да | Host-плагин гейтов, пресет, skills/commands | низкий | прогон тестов пакета после `pnpm install` |
| `@local/dsh-web-search-zai` (`packages/fork/web-search-zai`) | нет (входит в `packages/fork`, профиль не грузит) | `ctx.web` провайдеры, `dsh-credentials`, `dsh-web-fetch-http`, MCP client | низкий | `web/src/types.ts` без диффа, коды `WebError` те же; `web-fetch-http` добавил `classifyTransportFailure` — фолбэк не ломается; прогон `pnpm --filter @local/dsh-web-search-zai test` |
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