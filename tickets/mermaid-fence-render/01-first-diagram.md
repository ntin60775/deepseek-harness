# Тикет 01 — Первая диаграмма в чате

Блокеры: нет (базовый master).
Спека: [docs/plans/mermaid-fence-render.md](../../docs/plans/mermaid-fence-render.md), пункты «Готово» 0, 1, 2, 3, 4, 6a, 7, 8, 9.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Живая проба keyless web-scaffold с overlay-включением строки `ui-mermaid`: в транскрипте чата mermaid-fence ответа агента показывается SVG-карточкой в цветах текущей темы; кнопка «Исходник» свапает тело на код и обратно; «Копировать» копирует исходник в обоих состояниях; кнопка просмотрщика открывает диаграмму в лайтбоксе целиком; во время стрима и загрузки библиотеки виден код-блок, при ошибке парсинга/загрузки — код-блок с заметкой. Скриншоты light/dark читает исполнитель, кладёт в `proofs/`.

## Критерии приёмки (падают на базовом коммите)

1. **Web-сценарий `snapshots/web/mermaid-fence/`** (авторский keyless fixture с mermaid-fence, overlay `disabled: false` по shipped-id). Артефакт: `ui.expected.md` и вывод `DSH_SNAPSHOT=replay pnpm run test:web` по сценарию. Ожидание: ровно одна строка `- img "<label>"` для диаграммы (обёртка `role="img"` + `aria-label`, внутренний svg `aria-hidden`), положительная строка-охранник оверлея; сценарий ждёт `role=img` до снятия снапшота. На базе: строки `ui-mermaid` нет → fence = код-блок → голден расходится (load-bearing base-proof).
2. **Компонентные спеки четырёх состояний тела** (`ui-mermaid/tests`, jsdom, фиксированный SVG-вывод фикстуры). Артефакт: вывод vitest. Ожидание: стриминг = `children` passthrough без изменений; settled+загрузка = код-блок; settled+рендер = карточка с текстом узлов фикстуры и не код-блок; ошибка парсинга и reject `import()` = код-блок + notice, без повтора импорта, новая попытка на монтирование. На базе: модуль пакета отсутствует → падение; мутационная проба: снятие ветки notice краснеет.
3. **Регрессионная спека sanitize на коммитируемой фикстуре векторов** (flowchart HTML-лейбл, `click href "javascript:"`, `click call`, sequence HTML-лейбл, пустой текст; полные mermaid-исходники + записанный SVG-вывод Chromium). Артефакт: вывод vitest. Ожидание: в DOM нет `foreignObject`/`script`/`use`/live HTML; непустые текстовые узлы на месте (пустой текст → notice-путь); корень сохраняет `viewBox`, `role`, `aria-label`, `class`, `style`, `marker-*`; конфиг DOMPurify — default-профиль + `FORBID: ['foreignObject']`, глобальный `htmlLabels: false`. Мутация: снятие FORBID краснеет.
4. **Спеки контроллера рендера**. Артефакт: вывод vitest. Ожидание: stale-результат темы отброшен по generation-token; unmount во время рендера отменяет попытку; две карточки сериализованы владельцем-инстансом; повторный settle = новая попытка. На базе: падение отсутствием модуля.
5. **Спеки шапки/исходника/просмотрщика**. Артефакт: вывод vitest. Ожидание: свап тела на `CodeBlock` с `showHeader={false}` и обратно; copy в обоих состояниях; `aria-pressed` тумблера; Enter/Space на обёртке открывает лайтбокс; focus-restore при закрытии; data: URL — base64 от UTF-8 байтов с явными `width`/`height` из `viewBox` (спека с кириллическим лейблом и широкой фикстурой); семантика просмотрщика — viewport-fit. На базе: падение.
6. **Спеки маппинга темы (6a)**. Артефакт: вывод vitest. Ожидание: чистая функция токены→`themeVariables`; jsdom-спека на собственном style-фикстуре с литеральными значениями доказывает чтение в момент рендера и публикацию через hooks; CSS-text спека имён токенов; начальное значение `ctx.theme.getTheme()` при `theme` в inject. На базе: падение.
7. **Composition-спека строки бандла**. Артефакт: вывод vitest. Ожидание: строка ростера `insert:` с `id: ui-mermaid`, `name: '@deepseek-ai/dsh-client-ui-mermaid'`, `disabled: true`; `row.name` резолвится в workspace-манифест с `dsh.client.platform: 'web'` и зависимость в `packages/bundle/web-app/package.json`. На базе: строки нет → падение.
8. **Спеки a11y-обёртки**. Артефакт: вывод vitest + ARIA-строка критерия 1. Ожидание: `role="img"` + локализованный `aria-label` (mermaid-овский `aria-labelledby` снят), внутренний svg `aria-hidden="true"`, `tabindex=0`. На базе: падение.

## Охранники (зелёные на базе, не демо-носители)

- `verify-client-packages`, `verify-cordis-config`, `pnpm run hygiene` на дереве тикета: три поверхности регистрации, `exports["./client"]`, `dsh.client`, `files` glob, `packageFileExtras`, classification-запись `PRODUCT_PACKAGE_POLICY` (optional).
- `verify-locale-metadata`, `verify-client-ui-i18n`, `check:i18n`: словарь namespace `mermaid` + 8 locale JSON.
- `build:artifacts` + `build:check`.

## Примечания исполнения

- jsdom не рендерит mermaid (`getBBox`): компонентные спеки только на фикстуре; настоящий settle-рендер — критерий 1.
- Регистрация слоя: `ctx.slots.inject` с объектом `{ name: 'conversation.chat.markdown.fence', key: 'mermaid', id: '@deepseek-ai/dsh-client-ui-mermaid/fence/mermaid', locale: 'mermaid', inject }`; `children` не декларируются.
- Измерение ширины в этом тикете не вводится (тикет 02); тело рендерится во вписанном режиме.
## Отчёт исполнения (2026-11-16, ветка mermaid-first-diagram)

Реализация: пакет `packages/client/ui-mermaid` (fence-слой `conversation.chat.markdown.fence`, key `mermaid`), строка бандла `ui-mermaid` disabled:true, locale namespace `mermaid` (8 словарей + 8 metadata JSON), sanitize DOMPurify default + FORBID_TAGS foreignObject, контроллер рендера владельцем-инстансом в apply, тема через inject hooks compartment (чтение `getComputedStyle(document.body)` в async-шаге), a11y-обёртка role=img + aria-hidden внутренний svg, lazy-чанк `client.mermaid-entry.js` (вложенный rolldown codeSplitting:false, license banner, chained sourcemap).

### Доказательства по критериям

1. Web-сценарий `snapshots/web/mermaid-fence/` (авторский keyless fixture, overlay `disabled: false` по shipped-id): голден `ui.expected.md` — ровно одна строка `- img "Mermaid diagram"`; `DSH_SNAPSHOT=replay` зелёный. Base-proof: на базовом master (срез 2026-11-16) сценарий падает таймаутом ожидания role=img (fence = код-блок) — `proofs/01-base-proof.log`.
2. Компонентные спеки четырёх состояний: `tests/fence-states.client.spec.tsx` (9 тестов) — passthrough стрима, код-блок загрузки, карточка с текстом фикстуры, notice при failed, stale игнорируется, remount/re-settle/theme-revision = новая попытка, cancel на unmount. Мутация: снятие notice-ветки → 2 красных.
3. Sanitize на коммитируемой фикстуре `tests/fixtures/sanitize-vectors.json` (6 векторов: полные mermaid-исходники + записанный Chromium SVG, mermaid 11.17.2, securityLevel strict): `tests/sanitize.client.spec.ts` (11 тестов) — нет foreignObject/script/use/live HTML, видимый текст и атрибуты корня на месте, пустой текст и live-форма → notice-путь. Мутация ADD_TAGS foreignObject → красный (см. отклонение А).
4. Контроллер: `tests/render-controller.client.spec.ts` (9 тестов) — stale по generation-token (в т.ч. во время импорта и во время рендера), cancel, сериализация двух карточек, re-settle с новым id, failed без повтора, dispose, политика импорта (reject → failed, следующий attempt реимпортит).
5. Шапка/исходник/просмотрщик: `tests/fence-header.client.spec.tsx` (7 тестов) — свап на CodeBlock showHeader=false и обратно, aria-pressed, copy в обоих состояниях (одна запись на окно подтверждения, отказ хоста → idle), Enter/Space/другие клавиши, lightbox data:URL base64 UTF-8 с явными width/height (кириллический лейбл + широкая фикстура 1432.15625×63), focus-restore.
6. Тема 6a: `tests/theme.client.spec.ts` (5 тестов) — чистый маппинг на литеральной таблице, имена токенов сверены с design-platform.css, чтение style-фикстуры в момент рендера, публикация через hooks, re-resolve после theme/change; `tests/apply.client.spec.ts` — начальное значение ctx.theme.getTheme(), точный объект регистрации, theme/change → revision.
7. Composition: `packages/bundle/web-app/tests/mermaid-fence.spec.ts` — строка ростера insert id/name/disabled:true, row.name → workspace-манифест dsh.client.platform web + exports ./client + зависимость бандла.
8. A11y: спеки шапки (role=img + локализованное имя, aria-hidden, tabindex=0, одна img-роль) + ARIA-голден критерия 1.

Охранники: verify-client-packages ✓, verify-cordis-config (моя часть) ✓, build:artifacts 8/8 + build:check 2/2 ✓, test:docs 21/21 ✓, oxlint по тронутому 0 ✓, coverage per-file 100% ui-mermaid/src ✓ (55 тестов включая composition-спеку), gen-third-party-notices перегенерирован (mermaid → runtime-секция).

Живая проба (keyless scaffold + overlay): скриншоты light/dark карточки, dark source, dark/light viewer — `proofs/01-*.png`, прочитаны исполнителем; live-перерисовка на theme/change доказана сменой computed fill ноды и возвратом на Light. OMP TUI: локальный плагин `/home/prog7/home/dev/dsh-plugins/theme-omp` смонтирован в keyless scaffold через extraInstallAnchors (резолвинг) плюс insert-строка в probe-overlay; пробы light и dark gruvbox — `proofs/01-omp-*.png`, прочитаны исполнителем (карточка, чат, viewer). Первый пробный прогон без insert-строки показал дефолтную палитру — anchor даёт только резолвинг имени, строку ростера вставляет overlay; зафиксировано как методика, не дефект пакета.

Размеры артефактов (разовый замер): entry client.js 12 453 B (gzip 4 375 B); lazy client.mermaid-entry.js 3 412 709 B (gzip 913 427 B); одна копия dompurify внутри чанка (728 sources в карте, 66 mermaid).

### Отклонения от буквы спеки (зафиксированы, обоснованы замерами)

А. `FORBID: ['foreignObject']` из спеки — не ключ API DOMPurify; реализовано `FORBID_TAGS`. В dompurify 3.4.16 `foreignobject` уже в `svgDisallowed` и `DEFAULT_FORBID_CONTENTS`: дефолт сам вырезает тег и содержимое, поэтому мутация «снятие FORBID» поведенчески нейтральна и краснеть не может. Охранник доказан обратной мутацией `ADD_TAGS: ['foreignObject']` (смешанный вектор foreignObject + видимый SVG-текст краснеет). FORBID_TAGS остаётся явной пиной конфига.
Б. sequence-рендерер mermaid 11.17.2 не эмитит foreignObject ни при htmlLabels:true, ни с markdown-строками: HTML экранируется в SVG-текст. Вектор `sequence-html-label` записан как есть (исходник с HTML-попыткой, экранированный вывод); foreignObject-покрытие несут flowchart-векторы.
В. Векторы записаны с htmlLabels:false и securityLevel strict при дефолтной теме mermaid (тема base + маппинг токенов + 13px применяются в продакшн-рендере и доказаны theme-спеками и живой пробой); отдельный вектор `flowchart-html-label-live` записан с htmlLabels:true и доказывает вырезание live-формы вместе с содержимым (деградация по инварианту).
Г. Токены темы живут на `body` (light/dark листы design-platform.css), чтение — getComputedStyle(document.body).
Д. Регексы sanitize-спек case-insensitive: DOMPurify сериализует теги в lowercase, mermaid эмитит camelCase.

### Базовые красные (подтверждены прогоном на базовом коммите, к тикету отношения не имеют)

ui-settings-account (account + formatBalance, account ретраится), ui-deliverables review-tab (flake, в изоляции зелёный), ui-theme elevation-styles (SidebarRoot.module.css 1px), verify-no-unknown-casts (ui-conversation todo-panel:138), verify-locale-metadata + verify-cordis-config (packages/fork/web-search-zai), verify-optional-dependency-imports (api/session-controller commands.ts:24), hmr-live.e2e.ts (таймаут ожидания fixture-текста; воспроизведён на базовом коммите). Очередь — следующий sweep окна PR. Из-за базового hmr-live CI-лейн test:web:ci встаёт на serial-стадии; полный контур снят воспроизведением CI-порядка: serial-владельцы client-plugin-live и present-svg отдельно (зелёные), затем параллельный пул остальных 244 файлов (maxWorkers=6 и 3, идентичный результат): 214 passed, 30 файлов / 52 теста красны — все 30 воспроизведены на базовом коммите тем же прогоном (список в «Что осталось» continue.md). Новых красных от изменения нет; mermaid-fence сценарий в пуле зелёный.

## Ревью-панель (один прогон, 2026-11-16; qwen-token-plan/qwen3.8-flash xhigh, 4 роли)

- reviewer-tests: без мерж-блокеров. P2 закрыты правками: синтетический сырой вектор с javascript:/onclick/use (разрез DOMPurify доказан, click-векторы переименованы в inert-pipeline), unmount-тест ассертит cancel. P3: литералы width/height, aria-label на синтетическом корне — закрыты; остаток в hooks.md.
- reviewer-code: P1 нет. P2 (дубль paths-пары ui-mermaid в tsconfig.base.json) закрыт удалением мёртвой пары. P3 закрыты: viewBox читается с корня, catch-ветки именуют ошибку через console.debug; остаток (общая константа окна копирования) в hooks.md с причиной запрета рамки.
- reviewer-spec: P1 (stale verify-config-catalog/verify-module-graph при зелёной базе) закрыт перегенерацией обоих каталогов в этом диффе. P2 скоупа (баннер/bundle-split/notices в 01) зафиксирован как pull-forward в slicing-check.md и тикете 03: чанк ships в 01, раскрытие и охранник формы не могут ждать 03. P2 дубля paths закрыт. P3: инвариант видимого текста теперь исключает title/desc/metadata (спека-тест добавлен); формулировка отклонения В уточнена; частичный 6b и README-вынужденность зафиксированы в нарезке.
- reviewer-kb: P1 закрыты: спека исключена из пейринга (fork-local English-only), хэши коммитов убраны из прозы тикетов (verify-repository-references зелёный), контурные цифры отчёта приведены к фактическим прогонам (test:docs 21/21 после правок). P2 закрыты: строка ui-mermaid в групповом индексе packages/client/README.md (+ zh-пара и перезапись i18n-record), locale-метаданные локализованы (title + description, 8 языков), README приведён к FORBID_TAGS. P3 закрыты: ссылки на тикеты 01–03 в «Порядке тикетов» continue.md, счёт locale-файлов унифицирован на 8 (projections.md сохраняет историческую формулировку как запись гейта), updated индекса планов, финальные переносы строк, склеенный bullet hooks.md, формулировка пробела fit без будущего времени. Базовые красные doc-sync (export-jsdoc, persistence-catalog/changes, plugin-packages, client-catalog) подтверждены на базе и названы в hooks.md.
