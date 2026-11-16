# Хэндофф тикета 03 — Бандл, раскрытие, документы (юнит mermaid-fence-render)

Состояние на 2026-11-17 после merge тикета 02: master = `merge: mermaid-fence-render ticket 02 — theme and fit`. Worktree открывать от текущего master; плановые артефакты юнита закоммичены.

## Что уже есть от 01/02 (не переделывать)

- Ленивый чанк `lib/client.mermaid-entry.js`: single-chunk (вложенный rolldown codeSplitting:false), `clientBanner` лицензионного раскрытия по имени чанка, chained sourcemap; пины `mermaid` ровно 11.17.2, `dompurify ^3.4.16` в devDependencies; dompurify транзитивен через mermaid — одна копия.
- Пакетная bundle-split спека `tests/bundle-split.client.spec.ts` (пин `require.async("./client.mermaid-entry.js")` и набор emitted-чанков) — приехала pull-forward'ом в 01, охранник формы чанка.
- `THIRD_PARTY_NOTICES.md` перегенерирован в 01 (mermaid → runtime-секция); в 03 верифицировать финальный набор после fit-изменений 02.
- От 02: `src/client/fit.ts` (чистое правило), `src/client/measure.ts` (apply-owned ref-лицо, RO без debounce, `data-fit-mode` на карточке), Config `minFitScale` (0,1] дефолт 0.85 schemastery fails loud в клиентском entry, padding тела в обёртке `.body` над measure-контейнером, натуральная ветка `flex-shrink: 0` + явные width/height, вписанная = width 100% + inline max-width mermaid (фактическая ширина вписанного svg = min(measureWidth, W)).
- README пакета: секция Fit rule and configuration (якорь в оглавлении), Dev Note с правилом измерения и ссылкой на sign-off; Known Limitations без устаревшего пункта про отсутствие натуральной ветки.
- Web-сценарий `apps/web/tests/mermaid-fence.e2e.ts`: две карточки (малая + широкая фикстура), голден первой карточки, не-golden ассерты обеих веток/узкой колонки/переживания svg-узла при ресайзе; фикстура `snapshots/web/mermaid-fence/session.v4.jsonl` с двумя fence.
- Отчёт исполнения 02 и реестр зацепок — `tickets/mermaid-fence-render/02-theme-and-fit.md`, `hooks.md`; доказательства 02 — `proofs/02-*`.

## Объём 03 (спека п.10–12; критерии тикета 1–7)

- Поправка нарезки (slicing-check): критерии 1–2 (bundle-split, баннер/notices) приехали в 01 pull-forward'ом и на дереве 02 уже зелёные; в 03 они верифицируют финальный набор чанков и баннер после fit-изменений. Base-proof 03 несут критерии 3–5.
- Критерий 3: publish-набор — `files` glob `lib/client*.js` + `packageFileExtras` покрывают каждый эмитуемый чанк; hygiene (publint + constraints).
- Критерий 4: генерации каталогов (client/config/module-graph/dependency) + их verify-гейты. **Известное натяжение:** config-catalog сканер читает только host-entry `src/index.ts` (пустой apply без config-параметра), клиентский Config `minFitScale` в каталог не попадает — прецедент ui-context-menu, сверено панелью 02. Ожидание критерия «Config отражён в каталогах» расходится с областью генератора. Варианты: (a) оператор правит критерий (каталоги отражают то, чем владеет генератор; Config документирован README), (b) host-entry объявляет Config ради каталога — архитектурное изменение, требует одобрения. Не решать молча: ask оператору при исполнении.
- Критерий 5: README (Model Experience, Known Limitations уже на месте от 01/02 — верифицировать) + Agent Note решения по правилам dsh-archive-agent-notes (durable rationale: единый режим A, fit-правило и measure-лицо, viewport-fit просмотрщика); test:docs и doc-sync.
- Критерий 6: финальный контур (ниже). Критерий 7: разовый замер размеров стартового бандла до/после и ленивого чанка в `proofs/`; mermaid отсутствует в стартовом бандле; новый gate не строится.
- **Базовые красные генераторы:** hooks 01 закрепляет за тикетом 03/sweep перегенерации client-catalog (slot-catalog), plugin-packages, persistence-catalog/changes и verify-export-jsdoc — они красны на базе после rc3-мержа. Регенерация в 03 утянет чужой дрейф в дифф юнита: объём дрейфа сверить, решение «sweep внутри 03 или отдельным заходом» — оператору; молча не чинить и молча не пропускать.

## Методика и грабли (уроки 01/02)

- Node 24: `export PATH="/home/prog7/.local/share/node-lts/bin:$PATH"` (хостовый node 22 ломает PTC vm-фазы).
- tsdown пакета бандлит `lib/types`: после правок src сначала `pnpm exec tsc -b packages/client/ui-mermaid`, затем tsdown; для scaffold-проб затем `pnpm run build:web` (dist кеширует бандл).
- `git add -A` нельзя: tsc -b контрактных пакетов эммитит резидуе src/*.js/.d.ts — стейджить только свои пути.
- /tmp — tmpfs, почти полный (93% на 2026-11-17): базовые worktree для base-proof открывать на диске (`.agents/worktrees/`), свои scaffold-home убирать; чужое не трогать.
- Web-лейн serial по конфигу (`fileParallelism: false`, ~4 часа на пул). CI-порядок: serial-владельцы client-plugin-live и present-svg отдельно, затем пул `--fileParallelism --maxWorkers=3 --exclude` трёх serial-файлов (включая базово-красный hmr-live); ~25 мин. Имена красных файлов пула сверять со списком 30 базовых (continue.md «Что осталось»); file-level строки WebKit-проектов показывают skipped, красные тесты искать в Failed Tests.
- Базовые красные контура (воспроизведены на базе): 30 web-файлов 01 + client-plugin-live (голдen меню сессии получает строку Delete session) + rescope-vendor:check (residue rc3) + hmr-live + генераторы doc-sync + hygiene-красные (locale-metadata/cordis-config/no-unknown-casts/optional-dependency-imports — web-search-zai, todo-panel:138, session-controller commands.ts:24). Любое новое красное сверять прогоном на базовом worktree.
- Coverage: focused `vitest run --coverage <пакет>` сыплет глобальные per-file ошибки на неисполненных пакетах — читать строки своего пакета; хост-половина ui-mermaid (пустой apply) = 0 без threshold-ошибки и без uncovered locations; клиентская половина обязана быть 100/100/100/100.
- schemastery: transform-колбэк вызывается без options — `new z.ValidationError(msg, {})`; `z.number().max(1)` inclusive, эксклюзивный ноль — проверкой в transform.
- TS lib.dom `ResizeObserverBoxOptions` не содержит `inline-size` — observe без box-опции.
- jsdom: layout/ResizeObserver отсутствуют (стаб в harness), `viewBox.baseVal` читается; мерить ширину — spy на `Element.prototype.clientWidth`.
- Доказательные логи в proofs: без машинных путей, без install/build-шума, без хешей коммитов (гейт verify-repository-references); хеш не резолвится читателем после merge.
- Ревью-панель: 4 роли (reviewer-spec/tests/code/kb) через subagent spawn, qwen-token-plan/qwen3.8-flash xhigh (.agents/config.toml); один прогон, P1/P2 править, P3 в hooks.md; маршрут сверять живым list_subagent_models.
- KB-движок gitmark лежит в основном checkout `.agents/skills/kb-search/` (в worktree его нет): после правок документов `index` + `lint --strict` оттуда; WARN I8 (ontology.md против копии бандла) — предсуществующий, не чинить в тикете.
- Push без команды оператора не делается; PR-путь не проверен (CI форка disabled manually) — называть пробелом.

## Контур 03

Полный по критерию 6 тикета: `pnpm run test:gui`; `DSH_SNAPSHOT=replay pnpm run test:web` (включает build; воспроизведение CI-порядка serial+пул); `pnpm run hygiene`; `pnpm run doc-sync`; `build:artifacts` + `build:check`; per-file coverage тронутого src локально; мутационные пробы компонентных спек 01–02 остаются зелёными; replay-голдены существующих сценариев без диффа; замер бандла в proofs. Базовые красные вне объёма называются пробелом, не чинятся молча. Отчёт доказательств в тикет 03 по форме отчётов 01/02.