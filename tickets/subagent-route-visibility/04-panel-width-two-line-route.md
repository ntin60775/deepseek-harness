# Тикет 4 — Ширина панели по содержимому и двухстрочный маршрут

Блокеры: нет (исполняется после тикета 01, слитого в master).

## Зачем

Живая проба оператора в GUI после приёмки тикета 01 показала: фиксированной ширины 360px не хватает длинным маршрутам (`qwen-token-plan-deepseek/…` уходит в ellipsis вместе с провайдером), а одна строка `provider/model` смешивает две сущности. Решение оператора 2026-11-13: ширина выпадающей панели — по длине содержимого; имя провайдера на одной строке, имя модели + reasoning на ещё одной. Прямое решение оператора выше правила «правки только через тикет»; тикет фиксирует объём и доказательства постфактум. Спека: [subagent-route-visibility.md](../../docs/plans/subagent-route-visibility.md), «Решения гейта» (решение оператора 2026-11-13 после приёмки тикета 01) и п.1 «Готово».

## Что делает

В [SubagentHeaderLineage.module.css](../../packages/client/ui-subagent/src/client/SubagentHeaderLineage.module.css) меню получает `width: fit-content` между полом `min(360px, 100vw − 32px)` и потолком `min(560px, 100vw − 32px)`; формула левого clamp использует потолок, поэтому панель никогда не выходит за окно. Блок маршрута в [SubagentHeaderLineage.tsx](../../packages/client/ui-subagent/src/client/SubagentHeaderLineage.tsx) становится двухстрочным: `.routeProvider` (первая строка) и `.routeModelLine` (вторая: `.routeModel` + чип `.routeEffort`); обе строки ellipsis, чип `flex: none`; Tooltip с полным `provider/model` и tap-to-show обёртывает блок (`.routeAnchor`), aria-label ряда не меняется. Канал данных, скрытые состояния, словари и словари-ключи не меняются. README en+zh и спека обновлены тем же изменением.

## Демо-путь

Keyless scaffold, сценарий `subagent-conversation` с probe-only длинным label one-shot и длинным model id внука: открытая панель шире 360px и не шире 560px; провайдер и модель на разных строках; на 320px панель 288px, модель уровня 2 в ellipsis, чип не сжат; обе темы и touch tap-to-show. Скриншоты читает исполнитель.

## Критерии приёмки (падают на базовом коммите)

1. Компонентная спека: ряд рендерит провайдера и модель отдельными строками, чип — внутри строки модели, провайдер — вне её; блок внутри `.clickarea` в колонке имени. Артефакт: вывод focused-прогона ui-subagent; ожидание: спека п.1 (решение оператора). На базовом дереве одна строка `provider/model` — спека падает.
2. Живая проба: ширина панели >360px и ≤560px на длинном содержимом; на viewport 320px ширина 288px; модель уровня 2 в ellipsis (`scrollWidth > clientWidth`), ширина чипа равна широкой; провайдер и модель читаемы в обеих темах; touch-тап по провайдеру пинит тултип с полным маршрутом без открытия ребёнка. Артефакт: прочитанные скриншоты и лог пробы; ожидание: решение оператора и спека п.1.
3. Охранники и гейты: существующие спеки ui-subagent зелёные (141/141); base-proof обновлённых спек на базовом src; coverage тронутого src 100%; oxlint 0; `verify-client-ui-i18n` и parity словарей зелёные; `build:artifacts` + `build:check`; `test:docs` 21/21; `test:gui` без новых падений относительно базового списка continue.md; replay detect — дифф только в строках затронутых рядов (механический критерий «Ограничений»), refresh остаётся тикетом 03.

## Доказательства (исполнение 2026-11-13)

- Компонентные спеки: 141/141; base-proof (stash tsx+css): 13 падений, 7 охранников зелёные; stash восстановлен.
- Проба: широкая панель 544px (пол 360, потолок 560); 320px → 288px; модель уровня 2 `deepseek-v4.1-flash-1017-preview-extended` в ellipsis, чип не сжат; обе темы через `emulateMedia` с pollом `data-ds-dark-theme`; touch-тап пинит «Model route: deepseek-official/deepseek-v4-flash», URL не меняется. Скриншоты: [04-dark-menu.png](proofs/04-dark-menu.png), [04-light-menu.png](proofs/04-light-menu.png), [04-narrow-menu.png](proofs/04-narrow-menu.png), [04-touch-tooltip.png](proofs/04-touch-tooltip.png).
- Гейты: см. отчёт оператора в сессии исполнения; replay detect — ожидаемая краснота голденов каталога до тикета 03.
