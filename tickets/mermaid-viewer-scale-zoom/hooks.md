# Зацепки юнита mermaid-viewer-scale-zoom

Реестр открытых зацепок и базовых красных; автоприёмку не блокируют (P3/базовые).

- P3 (тикеты 01–02): `HoverCard.tsx` dismiss по Escape — bubble на window без проверки `defaultPrevented`; после выравнивания lightbox на общий modal-контракт один Escape закрывает и lightbox, и hover-preview. Правка — проверка флага в dismiss; условие возврата — sweep окна PR или тикет 02 (viewer наследует контракт).
- P3 (стек): экспорт `LightboxShell` без внешнего консьюмера до тикета 02 (mermaid viewer) — порядок тикетов, не отдельный PR.
- Лайт-контур: мутация M4 (padding из shell) не прогнана (jsdom не наблюдает CSS); охранник геометрии — зелёные e2e-пины markdown-images; условие возврата — полный контур окна PR.
- Базовые красные (воспроизведены на master 2026-11-18, к юниту отношения не имеют): context-menus ×2 теста («Delete session» vs «Archive session», Rename timeout — дрейф rc.4), ui-settings-account ×2, ui-theme elevation-styles ×1, ui-tool details-row ×2; список и условия возврата — continue.md и hooks.md юнита mermaid-fence-render.

- P3 (тикеты 02–03): `prepareViewerSvg` пересобирает DOMParser+XMLSerializer на каждый шаг зума; фикстуры 12–23 KB, боевые диаграммы кратно больше. Правка — проставлять width/height на live root по ref без пере-сериализации; условие возврата — perf-sweep окна PR после замера задержки шага на большой диаграмме.
- P3 (стек): общие зум-копии живут в feature-плагине documentpreview (`zoom/locales.ts`); ui-mermaid несёт дословную копию строк (симметрия значений), общего статического владельца копий нет — кандидат на вынос в ui-primitives/locale отдельным юнитом.

- P3 (среда): headless Chromium не резолвит `--dsw-mask-blur` (computed backdrop-filter: none) и не скроллит стрелкой сфокусированный flex-скроллер; dim маски и геометрия пинятся e2e, клавиатурная досягаемость скроллера — Tab-циклом. Условие возврата — ручная проба в живом GUI окна PR.
- P3 (среда, тикет 03): в полном `test:gui` под параллельной нагрузкой таймаутит `packages/client/ui-sidebar-documentpreview/tests/document-preview-license-bundle.client.spec.ts` (5.48 с при лимите 5 с, пакетный `npm pack`); изолированно зелёный за 2.37 с. Код юнита не при чём; условие возврата — окно PR или снятие дефолтного таймаута теста.
- P3 (вне объёма, воспроизведено на master): `apps/web/tests/mermaid-fence.e2e.ts` держит 2 ошибки oxlint `typescript(no-confusing-void-expression)` (строки 94 и 139, `evaluate().then(...)` и `.then(end => expect(...))`); в тикете 03 в файле переименован только тест. Условие возврата — sweep окна PR или тронутая строка.

Открытых ишью нет.