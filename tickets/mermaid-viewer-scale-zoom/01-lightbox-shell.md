# Тикет 01 — LightboxShell: chrome модального просмотра в один дом

Блокеры: нет.
Спека: [docs/plans/mermaid-viewer-scale-zoom.md](../../docs/plans/mermaid-viewer-scale-zoom.md), пункт «Готово» 1 и часть 7 (README ui-primitives).

## Демо-путь

Превью картинки (markdown-превью, картинка сообщения, вложения композера) открывается через LightboxShell с той же геометрией и поведением: маска не красит Windows-caption, close под ним, initial focus на close, Escape/маска/восстановление фокуса работают; Tab циклирует focusable диалога. Живая проба превью + e2e-пины зелёные.

## Критерии приёмки

1. **Shell и рефактор.** Артефакт: `packages/client/ui-primitives/src` (новый LightboxShell, ImageLightbox на нём) + вывод новых спек shell. Ожидание: chrome на `useModalLayer` (сам hook не меняется), DOM `backdrop[role=dialog][aria-modal] > stage-коробка (caption-inset, padding 40, flex) > [mask, close, контент консьюмера]`, close с `data-modal-autofocus`, маска onMouseDown, Tab циклирует все focusable. На базе: новая спека «Tab циклирует focusable диалога ImageLightbox» красная (базовый Tab пинит close) — base-proof несёт клавиатурный контракт.
2. **Non-regression консьюмеров.** Артефакт: вывод `test:gui` (спеки ui-primitives, ui-attachment, markdown-превью, image-lightbox) + replay `markdown-images`, `context-menus`, `file-upload-round` + typecheck `packages/experimental/client-ui-stats`. Ожидание: props ImageLightbox и имя экспорта `ImageLightboxLabels` не меняются; initial focus close, геометрия caption (mask y=40/close y=60 под titlebar), Escape уступает реальному Menu, восстановление фокуса — зелёные инварианты (на базе зелёные, падают на мутации: снятие data-modal-autofocus, перенос padding из shell, сломанный restore).
3. **Меню-спека.** Артефакт: переписанная спека image-lightbox «Escape уступает открытому меню» на реальном Menu. Ожидание: focused Menu с preventDefault владеет Escape, закрытие lightbox после закрытия меню; инвариант зелёный на базе.
4. **Документы примитива.** Артефакт: README ui-primitives (строка каталога LightboxShell, строка ImageLightbox, прозаический абзац о маске/caption) + вывод `verify-export-jsdoc`, `doc-sync`. Ожидание: каталог и проза описывают shell и контракт stage; зелёные гейты.

## Охранники

- `useModalLayer` без диффа; CSS-капы/object-fit img остаются в ImageLightbox.
- Четыре value-консьюмера без правок кода (кроме type-импортов, если имя не менялось — не меняется).
- Базовые красные вне объёма называются пробелами (hooks.md юнита), не чинятся молча.

## Отчёт исполнения (2026-11-18, ветка mermaid-lightbox-shell)

Реализация: `LightboxShell.tsx` + `LightboxShell.module.css` (chrome на useModalLayer), ImageLightbox — stage-контент, экспорт и алиас `ImageLightboxLabels` в index.ts, README en+zh и pairing-запись, исключение спеки в translation-pairing.manifest.json. Код ui-mermaid и четырёх value-консьюмеров не тронут.

Доказательства по критериям:

1. Shell и рефактор — proofs/01-focused.log (shell-спеки 3 + image-lightbox 5 зелёные); proofs/01-base-proof.log (Tab-цикл красный на базовом src, меню-спека зелёная на базе); proofs/01-mutations.log (M1 autofocus+порядок, M2 снятие слоя, M3 mask, M5 restore — красные); proofs/01-coverage.log (LightboxShell.tsx и ImageLightbox.tsx 100% по четырём метрикам).
2. Non-regression — proofs/01-focused.log 143/143 (modal-layer канон, ui-attachment ×2, markdown-image-entries, fence-header, stats-view); proofs/01-replay.log (markdown-images: геометрия caption обеих тем; file-upload-round: возврат фокуса; mermaid-fence: зелёный; context-menus: lightbox-пин зелёный ×3 платформы); typecheck experimental — client aggregate в proofs/01-build.log (tsconfig.client.json включает experimental).
3. Меню-спека — реальный Menu с portal и anchor={null} (продуктовая форма context-menu), proofs/01-focused.log.
4. Документы — proofs/01-jsdoc.log, proofs/01-doc-sync.log (43/43), proofs/01-pairing.log (1347 пар).

Отклонения и решения:

- Escape-контракт выровнен на общий modal-контракт: preventDefault вместо stopPropagation; следствие — Escape доходит до чужих bubble-слушателей с defaultPrevented=true, контракт назван в README/JSDoc; HoverCard без проверки флага закрывает hover-preview тем же Escape — зацепка в hooks.md.
- Dispatch Escape в консьюмер-спеках: window → `document.activeElement ?? document` (прецедент modal-layer); stats-view дополнительно отпускает hover перед Escape (Tooltip capture глотает Escape раньше bubble-слоя).
- Меню-спека: пустой div[role=menu] → реальный Menu; null-stub activeElement → detached opener (недостижимое в браузере jsdom-состояние).
- Лайт-контур (решение оператора 2026-11-18): финальный полный test:gui не перепрогоняется (proofs/01-gui.log — прогон середины прохода с пометкой; его 6 механических падений закрыты 01-focused.log); doc-sync после финальной прозы не перепрогоняется целиком (md-links/jsdoc/pairing точечно зелёные); новых браузерных прогонов и скриншотов нет; визуальный критерий геометрии доказан браузерными e2e-пинами markdown-images; мутация M4 (padding из shell) не прогнана — jsdom не наблюдает CSS, носитель геометрии — зелёный e2e-пин.
- Базовые красные вне объёма (воспроизведены на master, не чинятся): context-menus ×2 теста («Delete session» вместо «Archive session», Rename timeout — дрейф rc.4, список continue.md и hooks.md юнита mermaid-fence-render), ui-settings-account ×2, ui-theme elevation-styles ×1, ui-tool details-row ×2.

Пробелы: PR-путь не проверен (CI форка disabled manually); push без команды оператора не делается.

## Примечания исполнения

- proofs — `tickets/mermaid-viewer-scale-zoom/proofs/`.
- Push без команды оператора не делается; пробел PR-пути называется.