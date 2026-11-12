---
node_type: runbook
title: Продолжение работы над проектом
service: _platform
status: active
updated: 2026-11-12
---

# Продолжение работы над проектом

Это канонический старт каждой сессии. Источник истины — этот файл и тикеты, не память сессии.

## Состояние

Где проект: закрытые юниты и тикеты, открытый юнит, последний merge.

- Юнит онто-дока (прогон 2026-11-10) закрыт этим заходом: KB-оверлей в `docs/` (главный индекс, `ontology.md`, индексы папок, `docs/reference/` с шестью форк-справками, `docs/plans/`) и разделение бюджета `AGENTS.md` в `verify-doc-budgets`. Коммиты перечислены в конце этого раздела.
- Онто-док закоммичен двумя коммитами: `feat(scripts): budget marker regions separately in doc budgets` — разделение бюджета `AGENTS.md` в `verify-doc-budgets` с `scripts/verify-doc-budgets.spec.ts`; `docs(kb): bootstrap the knowledge-base layer over the docs tree` — KB-оверлей `docs/` (главный индекс, `ontology.md`, индексы папок, шесть справок в `docs/reference/`, `docs/plans/`, класс исключений в `docs/i18n/README.md` с перегнанной записью, переносы блока `ontoship` в `AGENTS.md`, игноры производных). Проверки на этих коммитах: `gitmark lint` — «чисто» (корпус 1515 файлов, 836 исключены `gitmark.scope.json`); `verify-doc-budgets`, `verify-md-links` (2458 файлов) зелёные; `verify-translation-pairing` зелёный; из `doc-quick` стоит только `markdown wrap` с шестью находками в `docs/ontology.md` — это тикет в «Порядке тикетов».
- Незакоммиченное от других сессий легло этим заходом: упрощение карточки вопроса в `ui-user-questions` (сняты expand/collapse, обновлены README с парой и запись, locales, стили, спеки и e2e), спека и тикеты юнита `transcript-readability` с её рядом в индексе `docs/plans/README.md` и исключением из пейринга, а также `gitmark.scope.json` и `.agents/config.toml`. Приёмку `transcript-readability` ведёт её сессия.

GitHub Actions форка (решение оператора 2026-11-10): воркфлоу с автоматическими триггерами `push`/`pull_request`/`issues`/`review` переведены в `disabled_manually` на стороне GitHub — это CI (`ci`, `ci-windows`, `ci-python`), `Build PR preview`, `Expected filenames`, `Issue lifecycle`, `Issue policy`, `Policy`×3, `weighted-approval`×2 и упаковщики `Release (dsh)`/`Release (vendor)`; `active` остались только `workflow_dispatch`/`workflow_call` (публикации релизов, сборка Desktop/CUA, `Deploy documentation`, ручной E2E). Пуш и PR не порождают ни одной проверки, поэтому перед коммитом локально выполняются пер-file coverage 100 % на `packages/*/*/src`, `pnpm run lint` или `oxlint` по тронутому пакету, `pnpm run doc-sync` для документов и `pnpm run build:check` после `build:artifacts`.

## Открытая работа

Что исполняется: юнит, тикет, на чём остановились, что дальше.

- Юнит `transcript-readability`: спека [docs/plans/transcript-readability.md](../plans/transcript-readability.md) утверждена на план-гейте и обновлена пакетом правок по гейту проекций (отчёт [tickets/transcript-readability/projections.md](../../tickets/transcript-readability/projections.md), 15 подтверждённых находок применены, 3 отвергнуты); тикеты 1–4 приняты оператором, самопроверка нарезки без расхождений. План-фаза завершена в сессии 2026-11-11/12; исполнение тикетов 1–3 переносится в новую сессию по решению оператора от 2026-11-12 (ниже).
- Решение оператора об исполнении (2026-11-12): тикеты 1–3 исполняют субагенты на маршруте `qwen-token-plan-deepseek/deepseek-v4.1-flash-1017` с reasoning `high`; каждый исполнитель обязательно смотрит глазами свой результат (скриншоты обеих тем, читает их сам); lead смотрит глазами работу каждого (diff + собственные скриншоты). Ревью-панель ship заменена этим решением оператора. Исполнение идёт в новой сессии: список субагентских маршрутов сессии фиксируется при создании (`subagent/model-selection-policy`, первый event выигрывает), план-сессия создана до включения маршрута и не может запускать на нём субагентов; маршрут добавлен оператором в `~/.dsh/profiles/web/cordis.patch.yml` и новые сессии его семплируют.
- Протокол исполнения для новой сессии: сверить маршрут и уровень `high` живым `list_subagent_models` (провайдер `qwen-token-plan-deepseek`, модель `deepseek-v4.1-flash-1017`); лимит `maxActiveSubagents: 4` вмещает трёх исполнителей. Каждый тикет — отдельный worktree (`create_worktree` от базового коммита, ship-правило; тикеты 1 и 2 оба правят `ui-chat`, изоляция обязательна). Исполнитель: читает тикет и спеку → tracer-bullet реализация → доказательные спеки (`pnpm run test:gui`, прочитанный лог, скилл `testing`) → сборка (`pnpm run build:artifacts`) → визуальная проба через e2e-scaffold (`launchWebScaffold` в `apps/web/tests/scaffold.ts`, keyless, записанные сессии; playwright в `apps/web/node_modules/.bin`, chromium установлен) → читает свои скриншоты (`read_image`) в обеих темах → коммит в ветке worktree → отчёт с путями доказательств. Фикстуры визуальной пробы: `snapshots/web/subagent-conversation` (тикеты 1–2: группы процесса, закрытые ходы), `snapshots/web/queue-actions` (тикет 3: todo/write в живом ходе). Живой GUI 3080 отвечает 401 (auth) — scaffold предпочтительнее. Lead: ревью diff каждого тикета + собственные скриншоты результата каждого worktree → локальный merge в `master` → пробел PR-пути называется (push без команды оператора не делается; CI форка disabled manually, локальные проверки по разделу «Состояние»). Точки остановки — «Ограничения» спеки. Тикет 4 (replay-refresh с механическим критерием диффа, полный `test:web`, GIF, приёмка оператором) исполняется после 1–3.

## Порядок тикетов

Юниты и тикеты в порядке исполнения; блокировки отмечены.

- [tickets/transcript-readability/01-process-container.md](../../tickets/transcript-readability/01-process-container.md) — контейнер группы процесса; блокировок нет; исполняется субагентом по протоколу выше.
- [tickets/transcript-readability/02-final-answer-card.md](../../tickets/transcript-readability/02-final-answer-card.md) — карточка финального ответа + ключ подписи в 8 словарях; блокировок нет; параллельно с 1 и 3 в отдельном worktree.
- [tickets/transcript-readability/03-live-todo-dock.md](../../tickets/transcript-readability/03-live-todo-dock.md) — живой список дел; блокировок нет; параллельно с 1 и 2 в отдельном worktree.
- [tickets/transcript-readability/04-replay-refresh-acceptance.md](../../tickets/transcript-readability/04-replay-refresh-acceptance.md) — replay-refresh и финальная приёмка; блокирован тикетами 1–3.
- [docs/plans/verify-md-wrap-kb-scope.md](../plans/verify-md-wrap-kb-scope.md) — `draft`, блокировок нет, следующий шаг `/ship`. Он же последнее падение `pnpm run test:docs` (`markdown wrap`, 6 находок в `docs/ontology.md`).

## Что осталось

Отложенная работа: пункт с условием возврата.
- Тикет [docs/plans/verify-md-wrap-kb-scope.md](../plans/verify-md-wrap-kb-scope.md) — держать в очереди; условие возврата — `markdown wrap` снова красен на носителе KB.
- Запас в бюджете `AGENTS.md`: тело держит `2080 / 2080` без запаса, регион `AGENTS.md#ontoship` — `172 / 200`. Первый апстрим-мерж, добавивший в корневой `AGENTS.md` хотя бы слово, требует relocate или condense до подъёма планки; носитель правила — [docs/plans/doc-budgets-ontoship-region.md](../plans/doc-budgets-ontoship-region.md).

## Стартовый промпт

Текст, с которого открывается сессия: «Продолжай исполнение тикетов 1–3 юнита transcript-readability по docs/ops/continue.md: субагенты на qwen-token-plan-deepseek/deepseek-v4.1-flash-1017 @ high, каждый смотрит глазами свой результат, lead смотрит глазами каждый». Чек-лист фазовых переходов: вычитка спеки перед план-гейтом — скилл `grilling`; критик после нарезки — скилл `to-tickets`; ревью-панель перед merge — скилл `ship` (для этого юнита заменена решением оператора от 2026-11-12).
