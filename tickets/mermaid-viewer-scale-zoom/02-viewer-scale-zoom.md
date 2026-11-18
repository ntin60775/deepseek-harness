# Тикет 02 — Просмотрщик диаграммы в масштабе чата с зумом и скроллом

Блокеры: тикет 01 (LightboxShell).
Спека: [docs/plans/mermaid-viewer-scale-zoom.md](../../docs/plans/mermaid-viewer-scale-zoom.md), пункты «Готово» 2–4, п.5 (viewer-ветка e2e и пробы обеих тем/узкой ширины) и часть 6 (focused-контур).

## Демо-путь

Карточка mermaid (opt-in overlay живой пробы) открывает просмотрщик: живой SVG в том же масштабе, что в чате (узкая диаграмма в широкой колонке — 1:1, широкая — вписанная), +/− зумуют каталожным ZoomControls, переполнение даёт скролл с достижимым началом, смена темы закрывает просмотрщик. Скриншоты обеих тем прочитаны исполнителем.

## Критерии приёмки

1. **Публикация масштаба.** Артефакт: `fit.ts`/`measure.ts` (scale в fit-варианте `resolveDiagramFit`, `data-fit-scale` на карточке, кэш viewBox во внешнем closure `createDiagramRef`) + вывод спек measure. Ожидание: fit публикует min(1, clientWidth/W), natural 1; режим исходника публикует из кэша; clientWidth не сдвинут обёрткой обоих режимов (padding над контейнером). На базе: спеки «data-fit-scale публикуется» и «масштаб в режиме исходника после remount» красные (dataset и контейнера в исходнике нет) — base-proof.
2. **Fence-level замена просмотрщика.** Артефакт: компонента MermaidFenceLayer + fence-level спека (открытие из баннера и Enter на обёртке). Ожидание: диалог содержит живой svg под обёрткой role=img с доступным именем, ширина svg = s0×W = отрендеренная ширина svg в чате в обоих режимах, data-URL img отсутствует; s0 только из dataset, отсутствие — fail loud. На базе: спека красная по делу (диалог есть, но с data-URL img и без живого svg) — base-proof.
3. **Зум/скролл/тема.** Артефакт: юнит-спеки viewer + styles-спека CSS-module. Ожидание: ZoomControls с семантикой DOCUMENT_ZOOM (шаг 0.25, кламп [0.25,4], disabled на границах), inline max-width/width рута снят (кейс s>1 ⇒ ширина > W), scroll-контейнер overflow:auto + inner margin:auto (текст CSS), рост revision закрывает viewer с восстановлением фокуса. На базе: юнит-спеки красны импортом (base-proof несут критерии 1–2, названо честно); styles-спека красная (CSS viewer нет).
4. **Локали.** Артефакт: 5 ключей зума (zoomControls/zoomMenu/zoomOut/zoomIn/zoomValue с {percent}) в 8 словарях + вывод `verify-client-ui-i18n` и locale-dictionary-parity. Ожидание: паритет и i18n зелёные; на базе ключей нет (красный паритет после добавления в один словарь — base-proof добавления).
5. **Удаление raster-пути.** Артефакт: дифф (svgToDataUrl и его спеки удалены, ImageLightbox заменён просмотрщиком) + focused ui-mermaid вывод. Ожидание: единственный консьюмер удалён вместе с helper; focused-набор зелёный; fit-поведение чата, sanitize и баннер без диффа (инварианты).

6. **Viewer-ветка e2e и пробы.** Артефакт: правка viewer-ветки `apps/web/tests/mermaid-fence.e2e.ts` (живой svg диалога вместо data-URL img) + replay-лог + скриншоты обеих тем и узкой ширины в `.artifacts/screenshots`, прочитанные исполнителем. Ожидание: сценарий зелёный на дереве тикета; ARIA-голден карточки не двигается. Решение оператора 2026-11-18: правка перенесена из тикета 03 ради зелёного контура 02.

## Охранники

- Правило fit одно и apply-owned: viewer ничего не пересчитывает.
- Мерmaid не перерендеривается на resize/зум (кэшированный svg).
- Базовые красные вне объёма — пробелы, не чинятся молча.

## Отчёт исполнения (2026-11-18, ветка mermaid-viewer-scale-zoom)

Реализация: fit-вариант несёт resolved scale (natural scale:1 симметрично); measure публикует `data-fit-scale`, кэш viewBox во внешнем closure ref, subtree-MutationObserver переписывает атрибуты при возврате source→diagram (обе ветки тернара — div, React переиспользует узел); viewer — живой sanitized SVG в LightboxShell при s0 из dataset (fail loud), ZoomControls/DOCUMENT_ZOOM, scroll-viewport tabIndex 0 с достижимым началом, тема закрывает viewer; svgToDataUrl удалён; локали зума дословно по прецеденту documentpreview + ключ viewer.scroll; README ui-mermaid приведён к текущему поведению в этом же тикете (facts-in-place удалённого raster-пути).

Доказательства по критериям:

1. Публикация масштаба — proofs/02-base-proof.log (23 красных на базовом src в 6 файлах: fit/measure/fence-viewer/viewer/styles/fence-header), proofs/02-focused.log (94/94), proofs/02-mutations.log M1/M2/M5, proofs/02-coverage.log (ui-mermaid/src/client 100% по всем файлам).
2. Fence-level замена — proofs/02-focused.log (fence-viewer: баннер/Enter, s0×W в обоих режимах, no img, fail loud), proofs/02-base-proof.log (на базе диалог с data-URL img), мутации M1/M2/M4.
3. Зум/скролл/тема — proofs/02-focused.log (юнит-спеки ZoomControls шаг/кламп/disabled, styles-спека, theme-close с переоткрытием на s0), proofs/02-replay.log (численные: s0×W, шаг по сетке 0.25, scroll-экстенты и достижимость начала/конца, Tab-досягаемость скроллера), мутации M3/M4/M5.
4. Локали — proofs/02-i18n.log, proofs/02-parity.log; привязка ключей к тулбару пинится fence-viewer (toolbar name, percent 125%).
5. Удаление raster — дифф (svgToDataUrl ноль упоминаний в коде/спеках), proofs/02-focused.log, proofs/02-jsdoc.log.
6. e2e-ветка и пробы — proofs/02-replay.log (2/2), скриншоты `.artifacts/screenshots/mermaid-viewer/viewer-{light,dark,narrow}-replay-1485474.png` прочитаны исполнителем: масштаб чата, зум 125%/100%, тулбар, close, скролл, dim маски; proofs/02-build.log (build:artifacts + build:check 2/2).

Отклонения и решения:

- Ветка «нет usable viewBox» реализована throw + спекой вместо предписанного спекой v8-ignore (fail loud без fallback, покрытие 100% без ignore) — сознательное отклонение, утверждается оператором на приёмке.
- Лайт-контур (решение оператора 2026-11-18): без полного test:gui и полного doc-sync; носители — focused 94/94, точечные гейты (jsdoc/i18n/parity/oxlint 0), один браузерный сценарий mermaid-fence.
- Стрелочный скролл сфокусированного скроллера не пинится: headless Chromium не скроллит стрелкой flex-скроллер (UA-поведение, не код тикета); клавиатурная досягаемость доказана Tab-циклом, скролл — экстентами; зацепка в hooks.md.
- Blur маски в headless не резолвится (токен среды, как и до тикета 01); dim и геометрия пинятся e2e; зацепка в hooks.md.
- Базовые красные вне объёма не чинились (список continue.md/hooks.md юнита mermaid-fence-render).

Пробелы: PR-путь не проверен (CI форка disabled manually); push без команды оператора не делается.

## Примечания исполнения

- Окружение спек: FakeResizeObserver и stub ширины из harness.client.ts (stub поднять в харнес), portal по document, jsdom даёт viewBox.baseVal.
- Живая проба только после сборки; скриншоты — `.artifacts/screenshots`.
- Отчёт доказательств — в этот файл; proofs — `tickets/mermaid-viewer-scale-zoom/proofs/`.
- Push без команды оператора не делается.