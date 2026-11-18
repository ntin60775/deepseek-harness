# Тикет 6 — Тон фона финала вместо полосы

Блокеры: нет (тикеты 1–3 и 5 слиты в master).

## Зачем

Решение оператора 2026-11-18 (макет `.scratch/transcript-cards/`, палитра OMP): полоса не нужна, финал выделять цветом фона. Источник тона выбран оператором из примеров: готовый токен темы `--dsw-alias-state-business-tertiary` — плотность владеет тема, магических чисел в CSS нет.

## Что делает

- `.finalAnswer` в [AssistantMarkdown.module.css](../../packages/client/ui-chat/src/client/chat/AssistantMarkdown.module.css): `border-left`/`padding-left` убраны, добавлен `background: var(--dsw-alias-state-business-tertiary)`. Правило стоит после `.card` при равной специфичности — тон перебивает фон карточки только на финале.
- Предикат финала, карточки реплик, `data-reply-card`/`data-final-answer`, края (открытый ход, image-only, stopped/failed/interrupted/max-tokens, reasoning-место) — без изменений: тинт унаследовал маркер полосы.
- В дефолтной теме тон — `deepseek-100` (светлая) / `deepseek-800` (тёмная); в omp-theme — тёплый оранжевый tertiary. Пузырь пользователя, контейнер процесса, сворачивание не меняются.
- Терминология «bar» → «tint» в JSDoc и именах спек.

## Демо-путь

Собрать бандл ui-chat (`pnpm --filter @deepseek-ai/dsh-client-ui-chat bundle`), обновить GUI. Завершённый ход: финальная карточка окрашена tertiary-тоном темы, без полосы; промежуточные — нейтральный input-major. Повторить в обеих темах; в omp-theme тон тёплый.

## Критерии приёмки (падают на базовом коммите)

1. Спека материала: `.finalAnswer` несёт `background: var(--dsw-alias-state-business-tertiary)` и не несёт `border-left`. Артефакт: вывод focused-прогона ui-chat; ожидание: спека п.3. На базовом дереве правило — полоса — спека падает.
2. Спеки предиката и карточек без изменений проходят: тинт там, где была полоса, края те же. Артефакт: вывод focused-прогона ui-chat.
3. Живая проба: тон читается отделённым от нейтральных карточек в omp-theme (тёмная) и в дефолтной теме. Артефакт: снимки пробы.
4. Документация: README ui-chat (en+zh пара) и JSDoc обновлены. Артефакт: `pnpm run test:docs`.