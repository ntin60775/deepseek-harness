# Хэндофф тикета 02 — Тема и вписывание (юнит mermaid-fence-render)

Состояние на 2026-11-16 после merge тикета 01: master = `docs(kb): record the merged first diagram ticket and the base-red sweep queue`. Worktree открывать от текущего master; плановые артефакты юнита закоммичены (в отличие от старта 01).

## Что уже есть от 01 (не переделывать)

- Тема-канал и контроллер: `packages/client/ui-mermaid/src/client/theme-state.ts` (createMermaidThemeChannel, hooks `mermaidTheme`, revision), `render-controller.ts` (generation-token, cancel, dispose, сериализация, политика импорта), `index.ts` (ctx.on('theme/change') → channel.change + controller.themeChanged; resolveVariables = getComputedStyle(document.body)).
- Компонент `MermaidFenceLayer.tsx`: effect [code, streaming, revision, renderDiagram] уже запускает новую попытку на theme/change; четыре состояния, шапка, lightbox, a11y-обёртка.
- Тема-маппинг `theme-variables.ts` (MERMAID_THEME_TOKENS, 13px фикс), sanitize, svg.ts (prepareDiagramSvg, svgToDataUrl), locale 8 словарей, строка бандла disabled:true, web-сценарий `apps/web/tests/mermaid-fence.e2e.ts` + голден `snapshots/web/mermaid-fence/ui.expected.md` (одна строка img).
- Спеки темы/контроллера/компонента уже доказывают theme/change → новая попытка и отброс stale: `tests/fence-states.client.spec.tsx` (theme-revision, unmount), `tests/theme.client.spec.ts` (канал, re-resolve), `tests/apply.client.spec.ts` (начальный revision, theme/change).
- Фикстура `tests/fixtures/sanitize-vectors.json`: вектор `wide-cyrillic` (viewBox 1432.15625×63) — готовая широкая диаграмма для критерия 5; harness `tests/harness.client.ts`.
- Config в пакете НЕТ; fit-функции НЕТ; measure-лица НЕТ; RO НЕТ; `data-fit-mode` НЕТ.

## Объём 02 (спека п.5, 6b; критерии тикета 1–6)

- Чистая fit-функция `(viewBox, injectedWidth, config)`; границы 0.84 / 0.85 / 0.86 (равенство → вписанный режим); W×H из `viewBox.baseVal` (jsdom читает baseVal — замерено спекой 01).
- Config `minFitScale` (0, 1], дефолт 0.85, валидация при загрузке fails loud (schemastery, прецедент Config пакета documentpreview); новая Config-строка → перегенерация `gen-config-catalog` (гейт verify-config-catalog краснеет на новой Config — урок P1 тикета 01).
- Measure-лицо: apply-owned ref-callback (прецедент `packages/client/ui-plugin-manager/src/client/header-scroll.ts`); ширина = clientWidth внутреннего непрокручиваемого measure-контейнера карточки, не зависит от режима; компонент не создаёт machinery. Три ответа правила измерения записать в дифф; подтверждение домен-эксперта — точка остановки: получить ask-подтверждение оператора и зафиксировать в отчёте/диффе (рамка спеки).
- ResizeObserver без debounce, порог в колбэке; смена режима = атрибуты корня/CSS из кэшированного SVG попытки, перерисовка mermaid на ресайз запрещена; натуральная ветка = явные width/height + горизонтальный скролл внутри карточки; вписанная = width 100% + max-width; `data-fit-mode` на карточке.
- Web-сценарий: не-golden ассерты широкой фикстуры (`scrollWidth > clientWidth`, `data-fit-mode` натуральной ветки) и узкой колонки; голден и ARIA остальных сценариев без диффа (скролл-контейнер не должен добавлять ARIA-узлов).
- Живая проба: light/dark/OMP TUI + узкая колонка одним сетом скриншотов в `proofs/`; OMP монтируется extraInstallAnchors (резолвинг) + insert-строка в probe-overlay (anchor сам строку не вставляет).

## Поправки нарезки (зафиксированы в slicing-check.md)

- Критерий 6 тикета НЕ падает на дереве 01: theme-попытка уже доказана спеками 01. В 02 он расширяется инвариантом метрик (шрифт 13px не меняется от темы) и охраняется; base-proof 02 несут критерии 1–5.
- Часть п.6b приехала в 01 pull-forward'ом вместе с контроллером (п.7 требует отброс stale-результата темы).

## Методика и грабли (уроки 01)

- Node 24: `export PATH="/home/prog7/.local/share/node-lts/bin:$PATH"` (хостовый node 22 ломает PTC vm-фазы).
- tsdown пакета бандлит `lib/types`: после правок src сначала `pnpm exec tsc -b packages/client/ui-mermaid`, затем tsdown; для scaffold-проб затем `pnpm run build:web` (dist кеширует бандл).
- Токены темы на `body`, не documentElement; DOMPurify сериализует теги в lowercase и сам режет foreignobject (svgDisallowed) — регексы спек /i, мутация охранника через ADD_TAGS.
- vitest expect без Playwright-матчеров: count()/getAttribute()/expect.poll.
- CI-лейн `test:web:ci` встаёт на базовом красном hmr-live; контур снимать воспроизведением CI-порядка: serial-владельцы (client-plugin-live, present-svg) отдельно, затем пул `--exclude` трёх serial-файлов, maxWorkers=3; 30 базовых красных web-файлов и doc-sync генераторы перечислены в «Что осталось» continue.md — любое новое красное сверять прогоном на базовом worktree.
- /tmp — tmpfs 16G: свои scaffold-home убирать после прогонов; чужое (/tmp/wlog и пр.) не трогать.
- `git add -A` нельзя: tsc -b контрактных пакетов эмтит резидуе src/*.js/.d.ts —.stageить только свои пути.
- coverage per-file 100% тронутого src локально; новый copy → 8 словарей locales.ts + locale metadata; oxlint по тронутому.
- Ревью-панель: 4 роли (reviewer-spec/tests/code/kb) через subagent spawn, qwen-token-plan/qwen3.8-flash xhigh (.agents/config.toml); один прогон, P1/P2 править, P3 в hooks.md.
- Push без команды оператора не делается; PR-путь не проверен (CI форка disabled manually) — называть пробелом.

## Контур 02

focused ui-mermaid + composition + web-сценарий replay; мутация порога fit; test:gui по затронутым; build:artifacts + build:check; replay-охранники без диффа; hygiene/doc-sync своя часть (config-catalog!); живые пробы тем и узкой ширины; отчёт доказательств в тикет 02 по форме отчёта 01.