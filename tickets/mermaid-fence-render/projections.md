# Проекционная валидация — mermaid-fence-render

Запись гейта проекций: прогон состоялся 2026-11-16, спека [docs/plans/mermaid-fence-render.md](../../docs/plans/mermaid-fence-render.md), утверждена на план-гейте 2026-11-16 до прогона. Один прогон на юнит.

Сессия lead (триаж): `qwen-token-plan-max/qwen4-max-preview` (runtime-строка, провайдер однозначен из каталога).

## Срезы и модели

Пул: `.agents/config.toml` `[validation]` — `deepseek-account/deepseek-flash` @ `max`, `qwen-token-plan/qwen3.8-flash` @ `xhigh`; оба маршрута и уровни сверены с живым `list_subagent_models` 2026-11-16.

| Срез | Цель и вопрос | Модель | Причина выбора | Субагент |
|---|---|---|---|---|
| покрытие + термины | покрытость «Готово» носителями, дрейф терминов, дыры поведения | deepseek-account/deepseek-flash @max | широкий чек-листовый обход спеки и кода, quality-first | critic-cov |
| порядок + рёбра | граф зависимостей пунктов, вертикальные демо-срезы, падение на базе | deepseek-account/deepseek-flash @max | широкий обход гейтов/манифестов и прецедентов scaffold | critic-order |
| доказательства + цена | честность носителей: ARIA-детерминизм, jsdom-факты, overlay-механизм, base-proof | qwen-token-plan/qwen3.8-flash @xhigh | тонкие платформенные факты и кросс-проверка механик harness | critic-proof |
| власть + окружение | соответствие правилам client/репо: каналы, measurement, faces, exports, строка бандла | qwen-token-plan/qwen3.8-flash @xhigh | глубокая кросс-проверка правил владельца и скриптов-гейтов | critic-authority |
| риск + время | гонки async-рендера, отказные пути, DOMPurify-профиль, data-URL, дрейф версий | deepseek-account/deepseek-flash @max | широкий risk-обход lifecycle и node_modules фактов | critic-risk |

## Находки и триаж

### Срез critic-cov (покрытие + термины)

- COV-1 P1 — подтверждена. Нет состояний «settled, чанк грузится» и «import() упал»; п.5 называет два состояния из четырёх. Правка: п.5 → четыре состояния с носителями.
- COV-2 P1 — подтверждена (факт сверен lead: ImageLightbox.module.css:26-29 капы min(100%,1600px)/100%, stage padding 40px; mermaid useMaxWidth default пишет width="100%" → data-URL без явных width/height даёт img дефолт 300×150). Правка: сериализация явных width/height из viewBox + предел «1:1»; формулировка уходит оператору вместе с ORD-5.
- COV-3 P2 — подтверждена. Субъект измерения fit не назван (узел, свойство, скроллбар); overflow-x меняет измеренную ширину → цикл. Правка: внутренний непрокручиваемый measure-контейнер, clientWidth, режим-независимость + спека.
- COV-4 P2 — подтверждена. Конфиг mermaid (strict, htmlLabels, useMaxWidth, 13px) вне приёмки. Правка: юнит-спека builder конфига; useMaxWidth-политика в п.2.
- COV-5 P2 — подтверждена. Ресайз/debounce без падающего носителя. Правка: спека с подменённым ResizeObserver + fake timers.
- COV-6 P2 — подтверждена. Ленивый import без падающего носителя (замер в PR не падает). Правка: spy-спека (не до settle, ровно один вызов); self-contained — существующий verify-client-packages.
- COV-7 P2 — подтверждена. Векторы спайка не в спеке и не в коммитимом артефакте (.scratch ignore); jsdom не рендерит mermaid (getBBox). Правка: полные mermaid-исходники векторов в коммитируемую фикстуру PR; sanitize-спека гоняет DOMPurify на записанных SVG, реальный рендер доказывается test:web.
- COV-8 P2 — подтверждена. Фокусируемость без действия, alt/метки/aria-pressed не заданы. Правка: Enter/Space → просмотрщик; спека tabindex/role/aria-label/alt/aria-pressed; метки в locale.
- COV-9 P3 — подтверждена. «1:1 против вписанной карточки» противоречит натуральной ветке п.2. Правка: роль просмотрщика по веткам; формулировка оператору с ORD-5.
- COV-10 P3 — подтверждена. settle перегружен (turn vs fence). Правка: термин «settled fence = fence.streaming === false».
- COV-11 P3 — подтверждена. Стриминг-ветка не названа: hoc-слой получает children пропом. Правка: стриминг → children passthrough; после settle → карточка; спека passthrough.
- COV-12 P3 — подтверждена. test:docs не включает i18n-гейт; три registration-поверхности не названы. Правка: verify-client-ui-i18n в п.11; три поверхности в п.9/0.
- COV-13 P3 — подтверждена. Нет кейса fit == minFitScale и спеки Config; 11/13 = 0.8462, не 0.85. Правка: кейс равенства (вписанный режим), спека Config (дефолт/отказ 0 и >1); derivation «округление вверх 11/13 ≈ 0.846 → 0.85».
- COV-14 P3 — подтверждена. coverage и i18n вне контурных команд. Правка: п.12 — per-file coverage тронутого src локально, полный гейт владеет CI; i18n-команда в п.11.

### Срез critic-order (порядок + рёбра)

- ORD-1 P1 — подтверждена. Нет пункта «скелет пакета + три поверхности + policy-запись»; от него скрыто зависят все. Правка: «Готово 0» (manifest/dsh.client/tsconfig/tsdown/три поверхности/product-use classification), носители verify-client-packages/verify-cordis-config/сборка.
- ORD-2 P1 — подтверждена. Цикл 1⇄9 через общий web-артефакт; overlay обязан включать существующую строку (прецедент apps/web/tests/sidebar-browser.overlay.yml). Правка: один тикет «строка disabled + зависимость + overlay-включение + web-сценарий/ARIA»; компонентные спеки раньше.
- ORD-3 P1 — подтверждена. Locale — предпосылка 1/3/4/5/8, включая 7 locale-JSON метаданных. Правка: 11a (словарь+namespace+locale NS+7 JSON) в первый срез; 11b (README/Agent Note/test:docs) — гейты.
- ORD-4 P1 — подтверждена. Sanitize — предусловие любого рендера; носитель п.1 может позеленеть на несанитизированном SVG. Правка: порядок 6→1/2/7/8; спека п.1 утверждает санитизированный DOM.
- ORD-5 P1 — СПОРНОЕ, оператору. ImageLightbox не даёт абсолютного 1:1 (капы вьюпорт/1600px); для широкой диаграммы просмотрщик уменьшает натуральную ширину карточки. Варианты: (a) переписать семантику на viewport-fit, снять «1:1/увеличение»; (b) size-режим в ui-primitives за текущие Рамки. Решение план-гейта о выборе ImageLightbox не переспрашивается — только семантика/объём.
- ORD-6 P2 — подтверждена. Интеграция ширина→fit→скролл без падающего assembled-носителя (jsdom без layout/ResizeObserver). Правка: fit — чистая функция (viewBox, injectedWidth, config); web-сценарий — не-golden браузерная проверка scrollWidth>clientWidth или data-fit-mode.
- ORD-7 P2 — подтверждена. П.7 смешивает маппинг (первый рендер) и канал re-render. Правка: 7a маппинг в первый срез (спека чистой функции), 7b канал theme/change во второй; темы — ручная приёмка.
- ORD-8 P2 — подтверждена. ARIA-голден не отличает SVG от заглушки div role=img. Правка: компонентная спека п.1 утверждает текст узлов санитизированного SVG из фикстуры и что тело не код-блок.
- ORD-9 P2 — подтверждена. Composition-спека зеленеет без пакета; disabled-строка пропускается verify-product-use. Правка: спека проверяет row.name → манифест с dsh.client platform web + зависимость бандла; classification-запись PRODUCT_PACKAGE_POLICY (optional).
- ORD-10 P2 — подтверждена. Контур не называет реально падающие гейты и генерации: verify-cordis-config/client-packages/client-ui-i18n/locale-metadata/product-use, gen-client-catalog/config-catalog/module-graph, THIRD_PARTY_NOTICES (mermaid dev-only→distributed), pnpm run test. Правка: п.12 — фактический набор; 10/12 — shipping-checklist.
- ORD-11 P3 — подтверждена. Ссылка на правило opt-in неверна: правило в docs/testing.md:39; cordis.patch.yml:326 — профильно-обусловленная строка. Правка: ссылка testing.md:39 + прецедент механизма overlay (`- id: …; disabled: false`).
- ORD-12 P3 — подтверждена. Обещание шире доказанных семейств; flowchart.htmlLabels deprecated в mermaid 11. Правка: глобальный htmlLabels: false; векторы flowchart+sequence уже покрывают не-flowchart семейство; per-family векторы не строить.

### Срез critic-proof (доказательства + цена)

Срез свернулся после steering lead (запрет дублей других проекций, возврат к пяти вопросам среза); до steering шёл ~23 мин против 6–10 мин остальных. Находки — в рамках вопросов среза.

- PRF-1 P1 — подтверждена (замеры Chromium + Playwright 1.61). ariaSnapshot НЕ прунит subtree role="img": подписи узлов попадают в golden, tspan-склейка слов зависит от шрифтовых метрик/wrapping → платформенный детерминизм не гарантирован; после DOMPurify FORBID foreignObject подписи сносятся и golden вырождается в `- img "Диаграмма"`, не отличая рендер от пустого SVG. Правка: выбор структуры — (a) обёртка role="img"+aria-label, внутренний svg aria-hidden="true" → проекция ровно одна строка, доказательство контента в компонентной спеке на фиксированном SVG; (b) оставить текст в golden, снять claim детерминизма, авторитетен Linux replay-контур. Выбор — оператору (D2).
- PRF-2 P2 — подтверждена (прогон jsdom 29: mermaid.render падает getBBox). Компонентные спеки = карточка/свап/copy/notice/sanitize на зафиксированном SVG-выводе; настоящий settle-рендер доказывается только web-сценарием. Правка: граница явно в п.1/2/5/7.
- PRF-3 P2 — подтверждена (замер jsdom: var()/color-mix не разворачиваются, алиасы читаются литералами; листы тем в component-спеках не подключены). Правка: jsdom-спека темы на собственном style-фикстуре с литеральными значениями (чтение в момент рендера + re-render на theme/change); CSS-text спека имён токенов; фактические light/dark — живая проба.
- PRF-4 P2 — подтверждена. «Падает отсутствием пакета» законно, но не различает; load-bearing base-proof = web-сценарий (на базе строки нет → fence = код-блок → golden расходится); компонентные спеки — мутационная проба (снятие ветки fit/notice/sanitize краснеет). Правка: назвать в Ограничениях/пунктах.
- PRF-5 P3 — подтверждена. Включение opt-in = overlay `disabled: false` по shipped-id (прецедент sidebar-browser.overlay.yml), не insert; несовпавший id в общем патчере только warn → положительная строка диаграммы в ui.expected.md обязательна как охранник тихого промаха оверлея. Правка: п.9.
- PRF-6 P3 — подтверждена со срезом цены. п.12 дублирует build внутри test:web → п.12 = test:gui + DSH_SNAPSHOT=replay test:web, build:check отдельной последней строкой; отдельная живая проба узкой ширины избыточна (тот же скриншот light/dark пробы; узкая ширина ассертится web-сценарием по ORD-6) — срезана. Пробел среза (jsdom viewBox.baseVal) закрыт lead-прогоном: jsdom читает baseVal (891×209) → стаб viewBox не нужен, ширина инжектируется.

### Срез critic-authority (власть + окружение)

- AUT-1 P2 — подтверждена. Чтение computed style в render нарушает reactive-правило; ThemeSnapshot.active.tokens несёт только override-слои; presenter ui-layout пишет токены своим слушателем, порядок не гарантирован. Правка: разрешённые themeVariables публикуются через hooks compartment (стабильный иммутабельный снимок, пересборка в apply-шаге); getComputedStyle — в async-шаге операции рендера после записи presenter'ом; начальное значение ctx.theme.getTheme() при theme в inject.
- AUT-2 P2 — подтверждена. Measurement-правило требует injected hook с sign-off домен-эксперта; HoverCard — cordis-free примитив, неверный слой; registrant'у hook-фабрики недоступны (hooks = bare observables). Правка: apply-owned ref-callback лицо по образцу ui-plugin-manager/header-scroll.ts; три ответа правила записаны (CSS не сравнивает viewBox-ширину с колонкой через порог; значение пиксельное; владелец — узел карточки); бизнес-прецедент ui-schedule/DeliveryHistory.tsx вместо HoverCard; sign-off фиксируется в диффе на ship.
- AUT-3 P2 — подтверждена. Лицензионное раскрытие приватных копий не названо: clientBanner по имени чанка (прецедент ui-sidebar-documentpreview/tsdown.config.ts) + перегенерация THIRD_PARTY_NOTICES; дерево mermaid тянет d3/cytoscape/katex/marked/roughjs — баннер покрывает все копии чанка. Правка: строка в Рамки + носитель в п.10. Уточнение: dompurify уже транзитивен через mermaid — одна копия в чанке, вторая явная не нужна.
- AUT-4 P2 — подтверждена. Не названы строки манифеста: exports["./client"], dsh.client (platform web, inject-рёбра включая theme), devDependencies (cordis peer+dev, mermaid, dompurify), files glob lib/client*.js, packageFileExtras для чанков, tsconfig.client.json reference, dependency бандла. Правка: перечислить в Рамки/п.0.
- AUT-5 P3 — подтверждена (свод с ORD-11). Форма opt-in строки: `- id: ui-mermaid` / `name: '@deepseek-ai/dsh-client-ui-mermaid'` / `disabled: true` внутри insert:-блока ростера; литеральный прецедент base/cordis.patch.yml:16-19; overlay сценария переключает строку по id (прецедент document-preview/paging.patch.yml).
- AUT-6 P3 — подтверждена. Hoc-регистрация неполна: id обязателен, locale для t-seat. Правка: точный объект { name: 'conversation.chat.markdown.fence', key: 'mermaid', id: '@deepseek-ai/dsh-client-ui-mermaid/fence/mermaid', locale: 'mermaid', inject }; перегенерация client-каталога в носители.
- AUT-7 P3 — подтверждена (свод с RSK-9/ORD-10). Носитель ленивой загрузки — пакетная bundle-split спека (прецедент ui-sidebar-terminal/tests/bundle-split.client.spec.ts пинит require.async("./client.<name>.js")); import() указывает на локальный модуль пакета; внутренние чанки mermaid обслуживаются тем же правилом; files glob; п.12 + hygiene + doc-sync; п.11 + gen-third-party-notices/gen-dependency-catalog.

### Срез critic-risk (риск + время)

- RSK-1 P1 — подтверждена. Нет одного lifecycle-контроллера async-рендера; mermaid глобален (singleton db, initialize мутирует общий конфиг, removeExistingElements по id) → гонки двух карточек, темы mid-render, повторного settle. Правка: контроллер попытки (уникальный render id, generation-token, отброс stale, cancel на unmount, сериализация между карточками владельцем-инстансом в apply/hooks); спеки stale/unmount/две карточки/повторный settle.
- RSK-2 P1 — подтверждена (эмпирический прогон DOMPurify 3.4.16). USE_PROFILES:{svg:true} удаляет role; default-профиль сохраняет; mermaid сам ставит aria-labelledby из accTitle → перекрывает фиксированный aria-label. Правка: точный конфиг (default-профиль + FORBID foreignObject); имя диаграммы — локализованная строка, aria-labelledby снимается; спека атрибутов корня после sanitize (viewBox/role/aria-label) + сохранность class/style/marker-*.
- RSK-3 P2 — подтверждена. foreignObject эмитится без гейта частью семейств (architecture/venn/sequence byFo/timeline/c4) → пустые боксы после sanitize; flowchart.htmlLabels deprecated. Правка: глобальный htmlLabels: false; один инвариант «после sanitize в SVG есть непустые текстовые узлы», иначе тот же notice+код-блок путь, что и ошибка парсинга; вектор утверждает видимость текста.
- RSK-4 P2 — подтверждена. use в svgDisallowed DOMPurify всегда → встроенные SVG-иконки молча пропадают. Правка: ограничение «иконки встроенных SVG не поддерживаются» + инвариант-спека (use отсутствует, диаграмма не пустая).
- RSK-5 P2 — подтверждена (свод с COV-2/ORD-5). data-URL без явных width/height → img 300×150. Правка: сериализация явных width/height из viewBox + спека intrinsic-размера; семантика «1:1» — оператору (ORD-5).
- RSK-6 P2 — подтверждена. Кодировка data-URL не названа; btoa на кириллице падает; img без onError. Правка: одна форма — base64 от UTF-8 байтов; спека с кириллическим лейблом и широкой фикстурой; отказ загрузки img не ожидается (источник — собственный сериализованный SVG), регрессия кодировки ловится спекой.
- RSK-7 P2 — подтверждена (свод с COV-1). Отказ lazy import не назван; прецедент highlight.ts без catch — антипаттерн. Правка: import rejected → код-блок + тот же notice; политика повтора явная (без повтора, новая попытка на монтирование); спека с замоканным reject.
- RSK-8 P2 — подтверждена. Окно settled-но-не-отрендерено; captureStableAria (scaffold.ts:1689-1700) снимает два равных снимка → код-блок стабилен → снапшот может зафиксировать до-диаграммное состояние. Правка: промежуточная презентация = тот же код-блок; web-сценарий явно ждёт role=img/имя до снятия снапшота.
- RSK-9 P2 — подтверждена. mermaid: 38 внутренних dynamic import, 271 mjs/12.7MB, 20 bare-зависимостей вне базлайна; пресет переписывает import в require.async по chunk.dynamicImports → self-contained правило под риском. Правка: п.10 называет форму бандлинга mermaid-входа (single-chunk/inline dynamic imports) и крепит фактический набор emitted-чанков существующим artifact-тестом; замер в PR остаётся.
- RSK-10 P3 — подтверждена. website пинит mermaid ровно 11.17.2; диапазон в ui-mermaid даст вторую копию; dompurify в install только через ui-sidebar-documentpreview ^3.4.16. Правка: пин mermaid 11.17.2, dompurify ^3.4.16; строка о website-пине как источнике дрейфа.
- RSK-11 P3 — подтверждена. Debounce не нужен: HoverCard-прецедент без debounce, RO коалесцирует по кадрам; fit — чистая функция, ре-рендер только при смене класса. Правка: RO без debounce, порог в колбэке; запрет перерисовки mermaid на ресайз (смена режима = атрибуты корня/CSS из кэшированного SVG, не новый render). Тривиальное решение lead о debounce отменяется по факту.

## Спорное, ушедшее оператору

- D1 (ORD-5 + COV-2/COV-9/RSK-5): семантика просмотрщика. Решение оператора 2026-11-16: **viewport-fit** — капы лайтбокса признаются, абсолютный 1:1 и «увеличение» сняты, Рамки не расширяются, ui-primitives не меняется.
- D2 (PRF-1): структура ARIA-носителя. Решение оператора 2026-11-16: **обёртка role="img" + aria-label, внутренний svg aria-hidden="true"** — golden ровно одна строка, контент диаграммы доказывается компонентной спекой на фикстуре.
- Пакет 49 подтверждённых находок: решение оператора 2026-11-16 — **применить**; спека docs/plans/mermaid-fence-render.md переписана пакетом в тот же день (status active).

## Запись гейта

Прогон состоялся 2026-11-16: все пять срезов исполнены и свернуты (critic-cov, critic-order, critic-risk, critic-authority, critic-proof); спека docs/plans/mermaid-fence-render.md, план-гейт 2026-11-16. Триаж lead: 49 находок подтверждены (COV 14, ORD 11, RSK 11, AUT 7, PRF 6), 2 спорных ушли оператору (D1, D2); оверинжиниринг-находок нет, PRF-6 срезал избыточную живую пробу и дубль build в контуре. Пробел jsdom viewBox.baseVal закрыт lead-прогоном. Правки спеки после план-гейта — только решением оператора; пакет подтверждённых находок и D1/D2 вынесены оператору 2026-11-16.
