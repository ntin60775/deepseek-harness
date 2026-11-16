# Тикет 02 — Тема и вписывание

Блокеры: тикет 01.
Спека: [docs/plans/mermaid-fence-render.md](../../docs/plans/mermaid-fence-render.md), пункты «Готово» 5, 6b.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Живая проба поверх тикета 01: переключение темы light/dark/OMP TUI перерисовывает диаграмму без перезагрузки страницы; узкое окно/колонка показывает широкую диаграмму в натуральную величину с горизонтальным скроллом внутри карточки, широкая колонка вписывает её; ресайз меняет только режим показа. Скриншоты тем и узкой ширины читает исполнитель, кладёт в `proofs/`.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Граничные спеки чистой функции fit** `(viewBox, injectedWidth, config)`. Артефакт: вывод vitest. Ожидание: fit 0.84 → натуральная ширина + скролл; 0.86 → вписывание; равенство fit == minFitScale → вписанный режим; `W×H` из `viewBox.baseVal`. На базе (дерево тикета 01): функции нет → падение; мутация порога краснеет.
2. **Спеки Config `minFitScale`**. Артефакт: вывод vitest. Ожидание: дефолт 0.85; значения 0 и >1 отвергаются при загрузке fails loud. На базе: падение.
3. **Спеки подменённого ResizeObserver**. Артефакт: вывод vitest. Ожидание: пересечение порога переключает режим; колбэк коалесцирует без debounce; число вызовов mermaid-рендера при ресайзе не растёт (смена режима = атрибуты корня/CSS из кэшированного SVG); measure-значение — `clientWidth` внутреннего непрокручиваемого контейнера, не зависит от режима. На базе: падение.
4. **Спека measure-лица**. Артефакт: вывод vitest. Ожидание: ширина инжектируется apply-owned ref-callback лицом (компонент не создаёт machinery); три ответа правила измерения записаны в диффе (CSS не сравнивает viewBox-ширину с колонкой через порог; значение пиксельное; владелец — узел карточки); подтверждение домен-эксперта зафиксировано. На базе: падение.
5. **Не-golden браузерная проверка web-сценария**. Артефакт: вывод e2e-ассерта сценария `mermaid-fence`. Ожидание: широкая фикстура даёт `scrollWidth > clientWidth` / `data-fit-mode` натуральной ветки; узкая ширина колонки ассертится там же. На базе: режима скролла нет → падение.
6. **Спека перерисовки на `theme/change` (6b)**. Артефакт: вывод vitest. Ожидание: fixture-событие темы запускает новую попытку через контроллер тикета 01; устаревший результат отброшен; перерисовка без перезагрузки; метрики диаграммы не меняются (шрифт 13px фикс). На базе: падение.

## Охранники

- `pnpm run test:gui` по затронутым пакетам; `build:artifacts` + `build:check`; replay-охранники существующих web-сценариев без диффа.

## Примечания исполнения

- Перерисовка mermaid на ресайз запрещена; смена режима работает с кэшированным SVG-выводом попытки.
- Живая проба узкой ширины отдельным скриншот-сетом не нужна beyond скриншотов тем: узкая ширина ассертится критерием 5; скриншот узкой колонки входит в пробу тем.

## Отчёт исполнения (2026-11-17, ветка mermaid-theme-and-fit)

Реализация: чистая fit-функция `resolveDiagramFit(viewBox, injectedWidth, config)` (`src/client/fit.ts`), Config `minFitScale` (0, 1] дефолт 0.85 schemastery fails loud (`src/client/index.ts`), apply-owned measure-лицо `createMermaidMeasureFace` (`src/client/measure.ts`, прецедент header-scroll.ts): ResizeObserver без debounce, порог в колбэке, `data-fit-mode` на карточке, смена режима = атрибуты корня кэшированного SVG; натуральная ветка = явные width/height + горизонтальный скролл внутри карточки (`flex-shrink: 0`), вписанная = width 100% + max-width; padding тела вынесен в обёртку над measure-контейнером, чтобы его `clientWidth` равнялся ширине места диаграммы. Тема 6b: инвариант метрик (13px фикс) охраняется спеками; перерисовка на theme/change через контроллер 01 без перезагрузки.

### Подтверждение домен-эксперта (точка остановки)

Оператор подтвердил правило измерения через ask-инструмент в сессии исполнения (2026-11-17): «Подтверждаю правило измерения». Три ответа зафиксированы в JSDoc `src/client/measure.ts` и Dev Note README: (1) CSS не сравнивает viewBox-ширину с колонкой через порог — сравнивает `resolveDiagramFit`, CSS выражает режим; (2) значение пиксельное — `clientWidth` внутреннего непрокручиваемого measure-контейнера, режим-независимое; (3) владелец — узел карточки (`data-fit-mode` на карточке, ref-лицо владеет apply).

### Доказательства по критериям

1. Границы fit: `tests/fit.client.spec.ts` (7 тестов) — 0.84 natural, 0.85 равенство → fit, 0.86 fit, cap 1, zero width, configured floor, W×H из viewBox (записанная фикстура 1432.15625×63). Base-proof: файл красен на базе (нет fit.ts) — `proofs/02-base-proof-components.log`. Мутация M1 (`<` → `<=`) краснит 4 теста — `proofs/02-mutations.log`.
2. Config: `tests/config.client.spec.ts` (5 тестов) — дефолт 0.85, границы (0, 1], отказ 0/>1/отрицательных/не-чисел fails loud. Base-proof: «Config is not a function». Мутация M2 (дефолт 0.8) краснит 1.
3. RO-подмена: `tests/measure.client.spec.tsx` (10 тестов) — порог в колбэке синхронно (без debounce), коалесцирование, attempts не растёт при ресайзе, смена режима атрибутами без смены svg-узла, observe один раз на measure-контейнер, remount на новой попытке, detach на source-swap, disconnect на unmount, inline max-width mermaid-формы не клампает натуральную ветку. Base-proof: нет measure.ts. Мутация M3 (снятие натуральной ветки) краснит 2.
4. Measure-лицо: apply-owned ref-callback, компонент не создаёт machinery; `tests/apply.client.spec.tsx` прокидывает валидированный minFitScale из apply в DOM (600/1000: natural по дефолту vs fit при 0.5); три ответа и подтверждение зафиксированы (раздел выше). Base-proof: нет measure.ts/Config.
5. Web-сценарий: `apps/web/tests/mermaid-fence.e2e.ts` второй тест — широкая фикстура (viewBox 1321.39×61 в продакшн-рендере) даёт `data-fit-mode=natural` и `scrollWidth > clientWidth`; узкая колонка 320px переводит малую карточку в natural со скроллом; ресайз 320↔1680 сохраняет svg-узел (маркер) и возвращает режим; фактическая ширина вписанного svg = min(measureWidth, W) — точность базы измерения. Голден первого теста без диффа (captureStableAria scoped first). Base-proof: на базе `data-fit-mode=null` → таймаут — `proofs/02-base-proof-web.log`.
6. Тема 6b: `tests/theme.client.spec.ts` — re-resolve после theme/change с литеральными таблицами, fontSize 13px и fontFamily inherit не меняются от темы; `tests/fence-states.client.spec.tsx` — theme-revision запускает новую попытку в монтированном слое (тело возвращается к код-блоку на время попытки, затем карточка), stale отброшен (спеки 01). Поправка нарезки: критерий 6 не падает на базе 01, base-proof несут 1–5.

Охранники: focused ui-mermaid + composition 79/79; `test:gui` по затронутым пакетам (ui-mermaid + bundle/web-app) 164/164; coverage per-file 100% клиентской половины ui-mermaid/src включая measure.ts и fit.ts — `proofs/02-coverage.log` (хост-половина — пустой apply без исполняемого кода, гейт не флагует); `build:artifacts` 8/8; `test:docs` 21/21; verify-config-catalog, verify-module-graph, verify-repository-references, verify-client-ui-i18n, verify-client-packages зелёные; oxlint по ui-mermaid 0; replay-охранники: present-svg 3/3, пул остальных сценариев в CI-порядке (параллельно maxWorkers=3) — 1006 passed / 52 failed / 35 skipped, красные = ровно 30 базовых файлов master (список 01), новых красных нет, mermaid-fence в пуле зелёный (2 теста), 4 unhandled-teardown rejection привязаны к базовым queue-actions/queue-image — `proofs/02-replay-pool.log`; голден mermaid-fence и ARIA остальных сценариев без диффа.

Живая проба (keyless scaffold + overlay; OMP через extraInstallAnchors package.json + insert-строка probe-overlay): light/dark wide+small, OMP TUI light/dark gruvbox wide+small, узкая колонка 320 wide+page — `proofs/02-*.png` (10 файлов), прочитаны исполнителем: темы перерисовывают диаграмму без перезагрузки (новый svg id, смена computed fill), узкая колонка показывает натуральную величину со скроллом внутри карточки, широкая вписывает малую диаграмму по центру. Малые карточки байт-в-байт равны карточкам 01 (вписанная ветка не менялась) — доказательство тем несут wide/narrow-наборы.

### Отклонения и правки ревью (зафиксированы)

А. Padding тела (20px 16px) вынесен в обёртку `.body` над measure-контейнером (находка панели: база измерения была шире места диаграммы на 32px, у порога фактический масштаб падал ниже floor 11px). `clientWidth` measure-контейнера теперь точно равен ширине места диаграммы; формула спеки буквальна, floor честный.
Б. Ветка `if (svg === null) return` удалена как недостижимый fallback (контейнер монтируется только в rendered-состоянии, svg коммитится до ref); каст `querySelector('svg') as SVGSVGElement` по прецеденту header-scroll.ts. Coverage-гейт per-file 100% закрыт.
В. `observe(measure, { box: 'inline-size' })` недоступен: TS lib.dom `ResizeObserverBoxOptions` не содержит inline-size; обычный observe, height-only доставка идемпотентна (зацепка в hooks.md).
Г. Ассерт точности e2e формулируется как min(measureWidth, W): вписанная ветка не растягивает svg шире натуральной ширины (inline max-width mermaid капает), равенство доказывает точность базы и floor.
Д. Логи доказательств очищены от машинных путей и install-шума; хеш коммита из mutations.log убран (гейт verify-repository-references).

### Базовые красные (воспроизведены на базовом коммите, к тикету отношения не имеют)

- `client-plugin-live.e2e.ts` «keeps ordered legacy Session menu rows before Archive…» — голден получает лишнюю строку «Delete session»; воспроизведено на базовом worktree (master дерева 01) — `proofs/02-base-red-client-plugin-live.log`. Новый базовый красный относительно контура 01; очередь — sweep окна PR.
- verify-locale-metadata — packages/fork/web-search-zai (базовый красный 01, hooks.md).
- Пул replay-сценариев: красные = ровно 30 базовых файлов списка 01 (continue.md «Что осталось»), включая declared-reasoning/menu-position в WebKit-проекте; 4 unhandled SessionHandleClosedError — teardown базовых queue-actions/queue-image. Новых красных от изменения нет — `proofs/02-replay-pool.log`.

### Пробелы

- PR-путь не проверен: CI форка disabled manually; push без команды оператора не делается.
- Полный `test:coverage` владеет CI; локально снят per-file focused-прогон тронутого src.

## Ревью-панель (один прогон, 2026-11-17; qwen-token-plan/qwen3.8-flash xhigh, 4 роли)

- reviewer-spec: P2 coverage measure.ts закрыт правкой Б; P3 имя e2e-теста и провенанс-комментарий закрыты; критерии 1–6 закрыты названными способами, объём не расползается.
- reviewer-tests: P2 coverage и фиксация sign-off закрыты (Б + раздел подтверждения); P3 fontFamily-источник и байт-равенство малых скриншотов — в hooks.md/отчёте.
- reviewer-code: P1 coverage закрыт (Б); P2 zz-пробы в тестовом глобе удалены до merge; P3 дубли сигнатур (Config = FitConfig, MermaidFenceInjected extends MermaidMeasureFace), единицы дефолта, CSS-комментарий механизма, inline-size — закрыты правками или в hooks.md; вопрос о формулировке defensive-patterns (hook vs ref-callback) — в hooks.md, разрешён рамкой спеки и sign-off оператора.
- reviewer-kb: P1 хеш в mutations.log закрыт (Д); P2 фиксация sign-off, отчёт исполнения, база измерения — закрыты; P3 оглавление/якорь README, Dev Note вместо дубля правила, bullet просмотрщика, шум логов — закрыты; охранники тикета не расширялись (критерии приняты оператором), полный набор гейтов назван в отчёте.
