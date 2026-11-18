# Проекционная валидация — mermaid-viewer-scale-zoom

Запись гейта проекций: прогон состоялся 2026-11-18, спека [docs/plans/mermaid-viewer-scale-zoom.md](../../docs/plans/mermaid-viewer-scale-zoom.md) утверждена на план-гейте 2026-11-18. Четыре среза flash-пула, стартовали одним сообщением; триаж основной сессии с проверкой каждой находки по коду.

## Срезы и модели

- `slice-carriers` — deepseek-account/deepseek-flash @ max: широкий скан покрытости «Готово», падаемости критериев и состава replay-консьюмеров; цель — носители и честность критериев.
- `slice-order-env` — qwen-token-plan/qwen3.8-flash @ xhigh: рёбра, скрытые предпосылки и факты окружения (jsdom, staticLinked-сборка, overlay/фикстуры); цель — порядок и окружение.
- `slice-risk` — deepseek-account/deepseek-flash @ max: риски поведения chrome/зума и оверинжиниринг; цель — риск.
- `slice-terms` — qwen-token-plan/qwen3.8-flash @ xhigh: связность разделов, точность фактов/якорей, термины и каталог контролов; цель — термины и связность.

Маршруты сверены с живым list_subagent_models 2026-11-18; раскладка пула — [.agents/config.toml](../../.agents/config.toml) `[[validation.pool]]`.

## Находки и вердикты триажа

Подтверждены (правки спеки пакетом, решение оператора ниже):

- F1 (P1, все срезы): формула s0 «clientWidth/W» неверна — отрендеренная ширина в fit-режиме = min(column, W) (inline max-width mermaid + CSS-кап, пин [mermaid-fence.e2e.ts:88-90](../../apps/web/tests/mermaid-fence.e2e.ts#L88-L90)). Публиковать resolved fit `min(1, clientWidth/W)` (добавить `scale` в fit-вариант `DiagramFit`, одно вычисление в fit.ts, measure только пишет dataset); критерий п.5 «s0 × W равен отрендеренной ширине svg в чате».
- F2 (P1, risk): inline `max-width: Wpx` на руте делает зум > 1 визуальным no-op — просмотрщик снимает/переопределяет inline max-width/width на инжектированном руте; кейс «s>1 ⇒ ширина > W, скролл появился».
- F3 (P1, risk+terms): владелец chrome — существующий `useModalLayer` (Tab циклирует все focusable, тулбар досягаем; initial focus close; Escape уступает реальному Menu через preventDefault). DOM-контракт shell: `backdrop[role=dialog] > stage-коробка shell (caption-inset, padding 40, flex) > [mask, close, контент консьюмера]`; маска onMouseDown; охранники структуры/геометрии [markdown-images.e2e.ts:292,300-301](../../apps/web/tests/markdown-images.e2e.ts#L292). Спеку «leaves Escape to an open context menu» на пустом div[role=menu] переписать на реальный Menu (поведение настоящего консьюмера, [context-menus.e2e.ts:391-420](../../apps/web/tests/context-menus.e2e.ts#L391)); shared-hook не менять.
- F4 (P1, carriers+order+terms): ложный факт Контекста — mermaid-fence.e2e открывает просмотрщик и пинит data-URL img (:62-68); правка viewer-ветки сценария входит в объём (носитель п.2/п.5), ARIA-голден снимается до открытия (:49) и остаётся нулевым; «нулевой дифф» сужен до голденов ui.expected.md (mermaid-fence, markdown-images).
- F5 (P1, order): ребро 3→2 блокирующее; просмотрщик ничего не пересчитывает, при отсутствии `data-fit-scale` — fail loud, не дефолт.
- F6 (P2, risk+order): W/H — парсинг кэшированной строки тела существующим `viewBoxSize` (helper остаётся, общий для viewer); live DOM не второй источник; ветка «нет usable viewBox» недостижима (инвариант mermaid-вывода) → v8-ignore с причиной; спеки helper переезжают в носители viewer.
- F7 (P2, risk+order): смена темы при открытом viewer сейчас размонтирует его и переоткрывает со сброшенным зумом; правило вынесено оператору (вопрос 2 ниже); носитель — компонентная спека revision при открытом viewer; порядок съёмки тем: сменить тему → дождаться settle → открыть viewer.
- F8 (P2, carriers; корректирует risk P3-1): достижимое svg-less состояние — remount карточки в режиме исходника после смены темы; кэш viewBox живёт во внешнем closure `createDiagramRef` (переживает remount карточки); инвариант attach ⇒ svg ∨ кэш; устаревшая спека measure «detaches measurement on the source swap» переписывается; устаревание кэша по теме принято (геометрия темой не меняется, инвариант метрик 13px).
- F9 (P2, risk): доступное имя диаграммы в viewer — обёртка `role="img" aria-label={diagram.label}` над aria-hidden svg (как в карточке); ассерт в replay.
- F10 (P2, risk+order): центрирование/скролл — CSS-only: scroll-контейнер (flex, overflow:auto, 100% stage) > inner с `margin:auto` (безопасное центрирование, начало достижимо при переполнении); без JS-измерений; носители — styles-спека CSS-module (прецедент hover-card-styles) + браузерные ассерты scrollWidth/clientWidth и достижимости scrollLeft/Top на max зуме.
- F11 (P2, carriers): base-proof п.2 — fence-level спека (на базе диалог есть, но содержит data-URL img и не содержит живой svg); компонентные спеки viewer красны лишь импортом и base-proof'ом не являются.
- F12 (P2, carriers+order+terms): value-консьюмеры ImageLightbox кроме mermaid — четыре: markdown-превью, MessageImage, ComposerAttachments, experimental StatsTable; `ImageLightboxLabels` остаётся экспортом под тем же именем (type-импорты ui-conversation/ui-attachment); non-regression: спеки всех консьюмеров + typecheck experimental-пакета (вне test:gui) + e2e-пины context-menus:391-420, file-upload-round:153-166, markdown-images:289-304.
- F13 (P2, terms): обёртка measure-контейнера над обоими режимами не сдвигает clientWidth (padding остаётся НАД контейнером, инвариант базы измерения); носитель — спека «clientWidth не изменился после обёртки».
- F14 (P2, order): окружение спек: FakeResizeObserver и stub ширины — из harness.client.ts (stub поднять в харнес), portal-контент ищется по document; jsdom даёт viewBox.baseVal/DOMParser — W·s/H·s проверяемы.
- F15 (P2, carriers+order): новый viewer-сценарий идёт с opt-in overlay (строка ростера выключена, Рамки запрещают включать) и authored-копией фикстуры mermaid-fence (два fence: fit + natural); голден пишется refresh, не record; скриншоты — .artifacts/screenshots (прецедент document-preview).
- F16 (P3, carriers): голден = ARIA-структура/лейблы; числовые критерии (s0×W, ×шаг, scroll-экстенты) — явные expects; «обе темы» — скриншоты/computed-style после переоткрытия.
- F17 (P3, order): живая проба только после сборки (ui-primitives staticLinked → Vite-dist); test:web собирает сам; focus-прогон без сборки запрещён.
- F18 (P3, terms): facts-in-place п.7 расширяется: прозаический абзац ImageLightbox ui-primitives README:133, спека mermaid-fence-render (:36, :49, «Ограничения» :59 — «интерактивного зума нет» после юнита ложно), feature-нота 2026-11-16-mermaid-fence-diagram-cards.
- F19 (P3, terms+risk): текстовые правки: chrome ~33 строки из 72; дефолт minFitScale 0.85 — якорь src/client/index.ts:41-48; паритет словарей — scripts/locale-dictionary-parity.spec.ts; «sanitized SVG» без висячего дефиса; тулбар — над scroll-viewport в stage-коробке, позиция относительно close названа.

Спорное, ушло оператору (вопросы 1–2 ниже): F20 — тулбар: переиспользование каталожного `ZoomControls` (recommended) против своего +/− с ×1.25/[0.1,8]; F7 — правило смены темы при открытом viewer.

Отвергнуто/скорректировано:

- risk P3-1 «skip-ветка недостижима, кэш не нужен» — отвергнута в части кэша: carriers нашёл достижимый remount в исходнике (F8); кэш нужен, но во внешнем closure, skip-ветка заменяется инвариантом.
- order P3-10 «padding/центрирование консьюмеру» — отвергнута: stage-коробка (inset+padding+flex) остаётся у shell, иначе едут пины markdown-images и переписывается CSS ImageLightbox против Рамок; консьюмер владеет только контентом stage.
- Оверинжиниринг: находок нет — кламп/шаг/disabled необходимы, центрирование CSS-only, кэш минимален, дубля chrome нет.

## Решения оператора

- Вопрос 1 (тулбар): переиспользовать каталожный ZoomControls (семантика DOCUMENT_ZOOM, процент-меню/пресеты как часть общего контрола).
- Вопрос 2 (тема при открытом viewer): закрывать viewer при росте revision, фокус на кнопку карточки когда connected.
- Вопрос 3 (пакет правок): «сразу исправить все находки» — F1–F19 внесены переписыванием спеки 2026-11-18 вместе с решениями 1–2; спека перечитана целиком, противоречий нет.