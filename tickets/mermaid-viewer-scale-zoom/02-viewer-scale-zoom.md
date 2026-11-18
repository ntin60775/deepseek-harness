# Тикет 02 — Просмотрщик диаграммы в масштабе чата с зумом и скроллом

Блокеры: тикет 01 (LightboxShell).
Спека: [docs/plans/mermaid-viewer-scale-zoom.md](../../docs/plans/mermaid-viewer-scale-zoom.md), пункты «Готово» 2–4 и часть 6 (focused-контур).

## Демо-путь

Карточка mermaid (opt-in overlay живой пробы) открывает просмотрщик: живой SVG в том же масштабе, что в чате (узкая диаграмма в широкой колонке — 1:1, широкая — вписанная), +/− зумуют каталожным ZoomControls, переполнение даёт скролл с достижимым началом, смена темы закрывает просмотрщик. Скриншоты обеих тем прочитаны исполнителем.

## Критерии приёмки

1. **Публикация масштаба.** Артефакт: `fit.ts`/`measure.ts` (scale в fit-варианте `resolveDiagramFit`, `data-fit-scale` на карточке, кэш viewBox во внешнем closure `createDiagramRef`) + вывод спек measure. Ожидание: fit публикует min(1, clientWidth/W), natural 1; режим исходника публикует из кэша; clientWidth не сдвинут обёрткой обоих режимов (padding над контейнером). На базе: спеки «data-fit-scale публикуется» и «масштаб в режиме исходника после remount» красные (dataset и контейнера в исходнике нет) — base-proof.
2. **Fence-level замена просмотрщика.** Артефакт: компонента MermaidFenceLayer + fence-level спека (открытие из баннера и Enter на обёртке). Ожидание: диалог содержит живой svg под обёрткой role=img с доступным именем, ширина svg = s0×W = отрендеренная ширина svg в чате в обоих режимах, data-URL img отсутствует; s0 только из dataset, отсутствие — fail loud. На базе: спека красная по делу (диалог есть, но с data-URL img и без живого svg) — base-proof.
3. **Зум/скролл/тема.** Артефакт: юнит-спеки viewer + styles-спека CSS-module. Ожидание: ZoomControls с семантикой DOCUMENT_ZOOM (шаг 0.25, кламп [0.25,4], disabled на границах), inline max-width/width рута снят (кейс s>1 ⇒ ширина > W), scroll-контейнер overflow:auto + inner margin:auto (текст CSS), рост revision закрывает viewer с восстановлением фокуса. На базе: юнит-спеки красны импортом (base-proof несут критерии 1–2, названо честно); styles-спека красная (CSS viewer нет).
4. **Локали.** Артефакт: 5 ключей зума (zoomControls/zoomMenu/zoomOut/zoomIn/zoomValue с {percent}) в 8 словарях + вывод `verify-client-ui-i18n` и locale-dictionary-parity. Ожидание: паритет и i18n зелёные; на базе ключей нет (красный паритет после добавления в один словарь — base-proof добавления).
5. **Удаление raster-пути.** Артефакт: дифф (svgToDataUrl и его спеки удалены, ImageLightbox заменён просмотрщиком) + focused ui-mermaid вывод. Ожидание: единственный консьюмер удалён вместе с helper; focused-набор зелёный; fit-поведение чата, sanitize и баннер без диффа (инварианты).

## Охранники

- Правило fit одно и apply-owned: viewer ничего не пересчитывает.
- Мерmaid не перерендеривается на resize/зум (кэшированный svg).
- Базовые красные вне объёма — пробелы, не чинятся молча.

## Примечания исполнения

- Окружение спек: FakeResizeObserver и stub ширины из harness.client.ts (stub поднять в харнес), portal по document, jsdom даёт viewBox.baseVal.
- Живая проба только после сборки; скриншоты — `.artifacts/screenshots`.
- Отчёт доказательств — в этот файл; proofs — `tickets/mermaid-viewer-scale-zoom/proofs/`.
- Push без команды оператора не делается.