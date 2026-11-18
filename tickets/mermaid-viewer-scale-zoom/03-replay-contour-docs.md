# Тикет 03 — Replay-контур, голдены и документы юнита

Блокеры: тикет 02 (просмотрщик и публикация масштаба).
Спека: [docs/plans/mermaid-viewer-scale-zoom.md](../../docs/plans/mermaid-viewer-scale-zoom.md), пункты «Готово» 5–7.

## Демо-путь

Replay прогон зелёный: mermaid-fence сценарий открывает живой svg диалога, новый viewer-сценарий численно доказывает масштаб чата/зум/скролл в обеих темах; голдены ui.expected.md не двигаются; скриншоты просмотрщика обеих тем и узкой ширины прочитаны; документы описывают shipped-поведение просмотрщика.

## Критерии приёмки

1. **Viewer-ветка mermaid-fence.** Артефакт: правка `apps/web/tests/mermaid-fence.e2e.ts` (ветка открытия просмотрщика) + replay-лог. Ожидание: диалог с живым svg, data-URL img не пинится; ARIA-голден карточки не двигается. Критерий верификационный: base-proof несут критерии 1–2 тикета 02 (названо честно).
2. **Новый viewer-сценарий.** Артефакт: сценарий + opt-in overlay + authored-копия фикстуры mermaid-fence (два fence: fit+natural) + proofs-лог + дифф refresh. Ожидание: числовые expects — s0×W равен отрендеренной ширине svg в чате (оба режима), шаг зума 0.25 по DOCUMENT_ZOOM, scrollWidth>clientWidth при переполнении, достижимость scrollLeft/Top на max зуме, доступное имя диаграммы; голден сценария = ARIA-структура/лейблы, пишется refresh не record; темы — переоткрытие после settle.
3. **Нулевой дифф голденов.** Артефакт: `git diff` после refresh по `snapshots/web/mermaid-fence/ui.expected.md` и `apps/web/tests/expected/markdown-images/ui.expected.md`. Ожидание: пусто; любой дифф — находка и блокирует. Инвариант: зелёный на базе, падает на мутации (случайный дифф голдена).
4. **Контур.** Артефакт: выводы `test:gui`, focused ui-mermaid/ui-primitives/ui-attachment, per-file coverage тронутого src, `build:artifacts`+`build:check`, `test:docs`, oxlint, typecheck experimental client-ui-stats. Ожидание: зелёное на дереве тикета; image-display jsdom-ассерты сохранены; базовые красные вне объёма названы пробелами.
5. **Живые пробы.** Артефакт: скриншоты `.artifacts/screenshots` (обе темы, узкая ширина, зум/скролл), прочитанные исполнителем через read_image. Ожидание: масштаб просмотрщика визуально равен чату, скролл и тулбар на месте, глифы/лейблы локализованы.
6. **Проза facts-in-place.** Артефакт: README ui-mermaid (раздел просмотрщика), спека mermaid-fence-render (описание просмотрщика и «Ограничения» про отсутствие зума), feature-нота mermaid-fence-diagram-cards (обновление или новая нота решения) + вывод гейтов нот и `doc-sync`. Ожидание: проза описывает живое поведение (масштаб чата, зум, скролл, shell); на базе проза утверждает data-URL lightbox без зума (расхождение факт/текст, названо честно).

## Охранники

- Ростер не включается (overlay только в сценарии); Config/Host/session без диффа.
- Поведение рендера чата и четырёх консьюмеров ImageLightbox без диффа.

## Примечания исполнения

- Отчёт доказательств — в этот файл; proofs — `tickets/mermaid-viewer-scale-zoom/proofs/`.
- Push без команды оператора не делается; пробел PR-пути называется.