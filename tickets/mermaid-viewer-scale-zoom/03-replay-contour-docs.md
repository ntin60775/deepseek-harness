# Тикет 03 — Replay-контур, голдены и документы юнита

Блокеры: тикет 02 (просмотрщик и публикация масштаба).
Спека: [docs/plans/mermaid-viewer-scale-zoom.md](../../docs/plans/mermaid-viewer-scale-zoom.md), пункты «Готово» 5–7.

## Демо-путь

Replay прогон зелёный: mermaid-fence сценарий открывает живой svg диалога, новый viewer-сценарий численно доказывает масштаб чата/зум/скролл в обеих темах; голдены ui.expected.md не двигаются; скриншоты просмотрщика обеих тем и узкой ширины прочитаны; документы описывают shipped-поведение просмотрщика.

## Критерии приёмки

1. **Viewer-ветка mermaid-fence.** Правка ветки и скриншоты перенесены в тикет 02 (решение оператора 2026-11-18); тикет 03 наследует зелёный сценарий и добавляет только новый числовой сценарий. Критерий верификационный: base-proof несут критерии 1–2 тикета 02 (названо честно).
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
## Отчёт исполнения (2026-11-19, ветка mermaid-viewer-replay-docs)

Реализация: новый replay-сценарий `apps/web/tests/mermaid-viewer.e2e.ts` на том же opt-in overlay `mermaid-fence.overlay.yml`; сценарий владеет авторской фикстурой `snapshots/web/mermaid-viewer/session.v4.jsonl` (копия двух fence'ов mermaid-fence + третий fence «средней» ширины, см. отклонения) и ARIA-голденом `snapshots/web/mermaid-viewer/ui.expected.md`, который пишется `DSH_SNAPSHOT=refresh`. Числовые ожидания живут в сценарии. Проза: раздел `Diagram viewer` в README ui-mermaid, правки спеки `mermaid-fence-render` (п.4, 8, «Рамки», «Ограничения», «Контекст»), новая нота решения `2026-11-18-mermaid-viewer-chat-scale` и кросс-ссылка из ноты `2026-11-16-mermaid-fence-diagram-cards`; регистрация host-plane e2e в `apps/web/tsconfig.json` (exclude) и `tsconfig.host.json` (include).

Доказательства по критериям:

1. **Viewer-ветка mermaid-fence.** Наследуется зелёной: `proofs/03-replay.log` — `mermaid-fence.e2e.ts` 2/2 (имя второго теста уточнено на «chat-scale viewer»); правка ветки и скриншоты обеих тем — тикет 02. base-proof несут критерии 1–2 тикета 02; отдельного base-proof у тикета 03 нет (названо честно).
2. **Новый viewer-сценарий.** `proofs/03-replay.log` (mermaid-viewer 2/2), `proofs/03-mutations.log`. Численные ожидания: три карточки — fit 1:1, natural 1:1 и fit с дробным масштабом `s0 = 0.890` (W=916.5 при колонке 816); для каждой `rendered = s0×W`; просмотрщик открывается по ширине чата (`viewer.width == card.rendered == s0×W`); шаг зума — к следующему узлу сетки 0.25 (0.890 → 1.00), обратный шаг — к узлу ниже (1.00 → 0.75); на max зуме 400% `scrollWidth>clientWidth` и `scrollHeight>clientHeight`, достижимы начало и оба конца (`scrollLeft = maxLeft`, `scrollTop = maxTop`, края содержимого совпадают с краями viewport); доступные имена диалога, скроллера, диаграммы и тулбара; темы — переоткрытие после settle (обе карточки получили новые svg-id). Голден — ARIA-структура диалога с метками, процент токенизирован (`{{percent}}`), число живёт в численных ожиданиях.
3. **Нулевой дифф голденов.** `proofs/03-refresh-diff.log`: прогон `DSH_SNAPSHOT=refresh` по трём сценариям → `git diff --stat` и `git status --porcelain` по `snapshots/web/mermaid-fence/ui.expected.md` и `apps/web/tests/expected/markdown-images/ui.expected.md` пусты. Инвариант падения на мутации: `proofs/03-mutations.log` — M1 «просмотрщик округляет опубликованный масштаб» → replay красный на `expected 916.5 to be close to 816`; M2 «случайный дифф голдена» → replay красный на сравнении, голден восстановлен побайтово.
4. **Контур.** `proofs/03-test-gui.log`, `03-focused.log` (112 файлов / 2242 теста, включая `fence-header.client.spec.tsx` после переименования теста), `03-coverage.log` (src не тронут → критерий вне объёма; пакетная проба ui-mermaid 15/94 без непокрытых записей), `03-build.log` (`build:artifacts` 8/8 + `build:check` 2/2), `03-test-docs.log`, `03-oxlint.log` (0 в объёме файла тикета), `03-typecheck-stats.log`, `03-jsdoc.log`. `image-display.expected.e2e.ts` не тронут — jsdom-ассерты сохранены отсутствием диффа. Базовые красные вне объёма названы в `hooks.md`.
5. **Живые пробы.** `proofs/03-scale-{light,zoommax,dark,narrow}-replay.png` (копии `.artifacts/screenshots/mermaid-viewer/scale-*-replay-<pid>.png`), прочитаны исполнителем через `read_image` на финальном дереве: в свете и тёмной теме просмотрщик стоит в масштабе чата (ширина диаграммы равна карточке), на 400% — переполнение с прокруткой, при ширине 320 — горизонтальный скролл, тулбар/close/локализованные лейблы (`Source`, `Copy`, `100%`) на месте; dim маски измерен числом (249 → 189 при 24% чёрного).
6. **Проза facts-in-place.** `proofs/03-doc-sync.log` (43/43 — включает гейты нот и пар) и `proofs/03-test-docs.log` (21/21). Проза описывает живое поведение: `data-fit-scale`, `W·s`/`H·s`, снятие inline `max-width`/`width`, шаг к узлу сетки 0.25 и кламп `[0.25, 4]`, `margin:auto`-центрирование, закрытие по ревизии темы, общий chrome `LightboxShell`; на базе проза утверждала data-URL lightbox без зума — расхождение снято.

Триаж ревью-панели (4 роли, один прогон, модели `qwen-token-plan/qwen3.8-flash@xhigh`): P1 нет; все P2 закрыты в этом проходе — добавлен отчёт, добавлены mutation-proofs, добавлен третий fence с дробным `s0`, переписаны coverage/refresh-логи, исправлены фокус-формулировки (закрытие возвращает фокус открывшему контролу; при ревизии темы карточка перерисовывается), переименована нота (дата первого предложения 2026-11-18), убрана устаревшая data-URL-строка спеки, добавлены ToC/ссылки, поправлены EOF-переводы строк и `settleCards`/viewport-хардкод. Закрытые P3 перечислены выше по тексту; остаточные — в `hooks.md`.

Слияние: ветка `mermaid-viewer-replay-docs` влита в `master` merge-коммитом после двух merge-forward'ов и финального контура; после слияния обновлены `docs/ops/continue.md` (тикет 03 слит, юнит закрыт) и этот отчёт.

Отклонения и их причины:

- **Третий fence в фикстуре** (сверх формулировки «два fence: fit+natural»): на двух fence'ах фикстуры `s0 = 1` в обоих режимах, поэтому численное «s0×W = ширина чата» было нефальсифицируемым (P2 панели). Третий fence шириной 916.5 даёт `s0 = 0.890`: мутация «открыть в 100%» краснеет (см. `03-mutations.log`).
- **Процент в голдене токенизирован**: число держат численные ожидания, голден — структуру и метки (P3 панели), плюс снимается зависимость голдена от ширины колонки.
- **Переименованы два заголовка тестов** (`mermaid-fence.e2e.ts`, `fence-header.client.spec.tsx`): «viewport-fit viewer» больше не описывает поведение (P3 панели). Правка косметическая, кода не касается.
- **Фикстура-копия вместо `session.source`**: тикет называет authored-копию; `recording: authored` защищает от автоперезаписи, inventory-охранник держит состав файлов.

Пробелы: push без команды оператора не делается; PR-путь не проверен (remote форка, CI disabled manually). Базовые красные вне объёма: `document-preview-license-bundle` таймаутит под параллельной нагрузкой (изолированно зелёный), `apps/web/tests/mermaid-fence.e2e.ts` имеет 2 допороговые ошибки oxlint (`no-confusing-void-expression`, строки 94/139) — воспроизведено на master, к тикету 03 не относится. `verify-client-catalog` и `verify-package-paths` были красными на базовом коммите и сняты merge-forward'ом master перед правками панели.
