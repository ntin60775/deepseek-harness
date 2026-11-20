# Sweep-refresh базовых красных web e2e (2026-11-20)

Решение оператора 2026-11-20: «чиним всё sweep-refresh'ем» (не маскировать реальные баги).
Ветка: `subagent-cwd-header` (post-rc5 + PR #12 subagent-cwd). Исполнено lead + 4 субагента-расследователя.

## Скоуп и результат

Базовый backlog `docs/ops/continue.md` (30 web-файлов, красные после rc3-мержа, сверены на базе 2026-11-16).
**Итог: 30/30 web pool-файлов зелёные** — финальный replay 29 файлов (markdown-wide-table починен ранее table-фичей): `225 passed / 3 skipped / 0 failed`, включая WebKit-arms.
Плюс 7 прочих borrowers cwd-фикстуры (background-job-list, jobs-panel-layering, live-job-stream, plan-review, session-panel-layout, shared-inspector, voice-input): `26/26 passed`.

## Метод и механический критерий

- `DSH_SNAPSHOT=refresh` пул (`--fileParallelism --maxWorkers=3`, CI-порядок hooks.md) → rewrite голденов/фикстур.
- **Критерий:** каждый дифф голдена содержит ТОЛЬКО намеренные fork-UI сигнатуры; неожиданный дифф блокирует и расследуется. Полная инспекция всех изменённых строк: аномалий нет.
- Hardcoded test-expectations обновлены per-file с замером и обоснованием (не blind).
- Изолированные Chromium-прогоны для расследований (щадить машину); WebKit-arms после установки бинарника.

## Намеренные сигнатуры (корневые причины дрейфа)

1. **Delete session** (fork-поверхность удаления сессий): +кнопка/строка `Delete session`, reorder Pin/Archive. Затронуты session-menu/tree голдены (github-ready-review, menu-material, session-reading, shortcuts-workspace, workspace-new-session-folding), sidebar-alignment labels.
2. **Queue-dock / Queued / reply-card** (fork-юнит transcript-readability): суффикс `Queued`, expanded todo-dock, placeholder композера `placeholder.default` (steer-all hint переехал в dock), reply-card padding +14px top (gap ответа 12→26px). Затронуты queue-actions/image, question-composer, lifecycle-chrome, subagent-interrupt-ui, seeded-history, cold-blank-session.
3. **cwd у subagent/subagent_fork** (фича ветки PR #12): +свойство `cwd` в tool-schema. Фикстура `fresh-round-trip/tool-schemas.expected.json` обновлена через ВЛАДЕЛЬЦА `replay-round-trip.e2e.ts` (borrowers read-only не пишут); дифф ровно +cwd ×2.
4. **Compact session pill** (fork-дизайн Rows.module.css): session-row action-кнопки 22px/margin 0/gap 2 vs workspace 24px/margin −4/gap 12. sidebar-alignment per-kind geometry, sidebar-drawer per-row spacing 24/28.
5. **Expand table** (table-фича lead): кнопка разворота широких таблиц; thinking-markdown golden.

## Реальный баг (найден и починен, НЕ замаскирован)

`thinking-markdown` contained/wideContentBounded:false — **баг table-фичи lead**: wide-block wrapper `content-box` + compact `width:100%` + padding/border → overflow на 14px. Фикс КОДА: `box-sizing: border-box` в `.tableScroll:global(.md-table-wide)` (MarkdownText.module.css). Тестовое ожидание contained=true корректно.

## Каскады и ordering-урок

- `seeded-history` Context-row/aria: каскад stale-геометрии (+12 до reply-card). Тест ассертит геометрию ДО append контекста → обрыв → контекст не append'ится → aria/Context падают каскадно. Фикс геометрии +26 устраняет каскад; 4 голдена restored to HEAD (bulk-refresh снял их в сломанном состоянии — **ordering: refresh голденов ПОСЛЕ фикса hardcoded-ассертов**).
- `lifecycle-chrome` materialized/recovers (0>=1): каскад hero-golden дрейфа (тест обрывается до отправки → LIGHTHOUSE не рендерится). Refresh hero/plan голденов чинит весь файл.
- `subagent-interrupt-ui` FIFO: stale placeholder (queue-dock) + image-queue golden.

## Hardcoded test-expectations (обновлены с обоснованием)

- `sidebar-alignment`: per-kind geometry (session compact 22 / workspace base 24), labels Delete+reorder, параметризованные hit-точки. 18/18.
- `sidebar-drawer`: per-row spacing pins 24/28 вместо cross-row equality. 7/7.
- `chat-scroll-contract`: large-input visibleSteps 0 (reply-card +30px сдвинул пограничный кейс; строка 979 уже группирует large-input с body-only). 17/17.
- `seeded-history`: gap ответа +26 (12 gap + 14 reply-card padding).
- `thinking-markdown`: pinned против content-top хоста (process-group body padding 8px; sticky top:0 корректен). 1/1.
- `subagent-interrupt-ui`: placeholder композера `placeholder.default` (queue-dock). 3/3.

## Environmental

WebKit: установлен `webkit-2311` (playwright 1.61.1) + системная `libwoff1` (libwoff2dec.so.1.0.2, оператор одобрил pkexec). WebKit-arms прогоняются.

## Осталось (вне скоупа web pool sweep)

- `hmr-live` (serial-владелец CI-лейна, таймаут), `client-plugin-live` (голден меню сессии +Delete session) — serial-стадия, отдельно.
- `rescope-vendor:check` (hygiene residue после rc3).
- Чужие `test:gui` красные (ui-settings-account, ui-deliverables review-tab) — отдельный sweep.
- Полный `test:web` лейн (~230 файлов) не прогонялся целиком; верифицированы 30 red + 7 borrowers + table-impact (только thinking-markdown). Финальный полный прогон — checkpoint оператора.

## Доказательства

Логи: `/tmp/dsh-final2.log` (29 файлов 225/228), `/tmp/dsh-borrowers.log` (7 borrowers 26/26), изолированные прогоны субагентов. Диффы голденов — только намеренные сигнатуры (полная инспекция). Working tree: 43 файла (table-фича + sweep), без коммита.