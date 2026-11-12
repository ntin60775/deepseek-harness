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
- Юнит `transcript-readability`, тикеты 1–3 исполнены и слиты в `master` этим заходом (2026-11-12): `feat(ui-chat): frame the visible process group body in a quiet container`, `feat(ui-chat): render the completed closing reply in a final-answer card`, `feat(ui-conversation): expand the todo dock while the session runs`. Проверки на слитом master: `ui-chat`+`ui-conversation` — 121 файл / 1971 тест зелёные; `test:docs` 21/21; `build:artifacts` 8/8, `build:check` 2/2. Конфликт хэшей `ui-chat/README.i18n.yaml` при merge тикета 2 разрешён перегенерацией `verify-translation-pairing --write`.
- Тикет 5 юнита `transcript-readability` исполнен и слит в `master` (2026-11-12): `feat(ui-chat): card every reply and mark the final answer with a blue left bar` — решение оператора 2026-11-12 (приёмка макета `.scratch/transcript-cards/`): карточку получает каждая реплика агента, финал отличает синяя полоса слева (`--dsw-alias-state-business-primary`, 3.5px, компенсированный padding) без подписи; ключ `message.finalAnswer` удалён из 8 словарей. Проверки: focused `ui-chat` — 65 файлов / 1054 теста зелёные; base-proof новых спек на базовом src (8+8 падений); `oxlint` по ui-chat — 0 ошибок; `test:docs` 21/21; `build:artifacts` 8/8, `build:check` 2/2; визуальная проба keyless e2e-scaffold (seeded-history) — скриншоты обеих тем и узкой ширины прочитаны, полоса и карточки на месте, подписи нет. Полный `test:gui` на дереве тикета: 5 падений в `ui-settings-account` (account, formatBalance) и `ui-deliverables` (review-tab) — воспроизведены на чистом master, к тикету отношения не имеют; остаются в очередь следующего sweep. Покрытие focused-прогона: `locale.ts` 100%; `apply.ts:291` (`loadOlder`) не покрыт в изолированном ui-chat-прогоне — кросс-пакетная ветка, покрывается другими полосами; полный coverage-гейт владеет CI.

GitHub Actions форка (решение оператора 2026-11-10): воркфлоу с автоматическими триггерами `push`/`pull_request`/`issues`/`review` переведены в `disabled_manually` на стороне GitHub — это CI (`ci`, `ci-windows`, `ci-python`), `Build PR preview`, `Expected filenames`, `Issue lifecycle`, `Issue policy`, `Policy`×3, `weighted-approval`×2 и упаковщики `Release (dsh)`/`Release (vendor)`; `active` остались только `workflow_dispatch`/`workflow_call` (публикации релизов, сборка Desktop/CUA, `Deploy documentation`, ручной E2E). Пуш и PR не порождают ни одной проверки, поэтому перед коммитом локально выполняются пер-file coverage 100 % на `packages/*/*/src`, `pnpm run lint` или `oxlint` по тронутому пакету, `pnpm run doc-sync` для документов и `pnpm run build:check` после `build:artifacts`.

## Открытая работа

Что исполняется: юнит, тикет, на чём остановились, что дальше.

- Юнит `transcript-readability`: спека [docs/plans/transcript-readability.md](../plans/transcript-readability.md) утверждена на план-гейте, обновлена пакетом правок по гейту проекций (отчёт [tickets/transcript-readability/projections.md](../../tickets/transcript-readability/projections.md), 15 подтверждённых находок применены, 3 отвергнуты) и приёмкой макета 2026-11-12 (карточки всех реплик, синяя полоса финала без подписи — тикет 5); тикеты 1–5 приняты оператором, самопроверка нарезки без расхождений. План-фаза завершена в сессии 2026-11-11/12; тикеты 1–3 и 5 исполнены и слиты в `master` в сессии 2026-11-12 (коммиты в «Состоянии»); следующий — тикет 4, блокировки сняты.
- Решение оператора об исполнении (2026-11-12): тикеты 1–3 исполняли субагенты на маршруте `qwen-token-plan-deepseek/deepseek-v4.1-flash-1017` с reasoning `high`; каждый исполнитель обязательно смотрел глазами свой результат (скриншоты обеих тем, читает их сам); lead смотрит глазами работу каждого (diff + собственные скриншоты). Ревью-панель ship заменена этим решением оператора. Список субагентских маршрутов сессии фиксируется при создании (`subagent/model-selection-policy`, первый event выигрывает); маршрут добавлен оператором в `~/.dsh/profiles/web/cordis.patch.yml` и новые сессии его семплируют. По ходу исполнения оператор остановил субагентов до коммита и поручил lead лично проверить результат и завершить: lead вычитал diff и спеки каждого тикета, прогнал focused-наборы (`ui-chat`, `ui-conversation`), base-proof новых спек (падение на базовом src), `test:docs`, `build:check`, просмотрел скриншоты обеих тем каждого worktree, закоммитил тикеты и слил в `master`.
- Исполнение тикетов 1–3 (2026-11-12): каждый тикет — отдельный worktree от базового коммита (тикеты 1 и 2 оба правят `ui-chat`, изоляция обязательна). Визуальная проба — keyless e2e-scaffold (`launchWebScaffold` в `apps/web/tests/scaffold.ts`, записанные сессии; chromium установлен), скриншоты обеих тем и узкой ширины читались через `read_image`; проба и её tsconfig-исключение не коммитились. Доказательства каждого тикета: новые компонентные спеки (падают на базовом src), focused-прогон `ui-chat`/`ui-conversation`, `test:docs`, `build:artifacts`+`build:check`, скриншоты. Push без команды оператора не делается (CI форка disabled manually); пробел PR-пути называется. Тикет 4 (replay-refresh с механическим критерием диффа, полный `test:web`, GIF, приёмка оператором) — следующий; обновление replay-expected только по механическому критерию спеки п.5 (в diff допустима лишь новая строка подписи финала + строки прогресс-полосы в `queue-actions/layout.expected.md`), любой иной diff блокирует refresh.

## Порядок тикетов

Юниты и тикеты в порядке исполнения; блокировки отмечены.

- [tickets/transcript-readability/01-process-container.md](../../tickets/transcript-readability/01-process-container.md) — контейнер группы процесса; исполнен и слит в `master` (2026-11-12).
- [tickets/transcript-readability/02-final-answer-card.md](../../tickets/transcript-readability/02-final-answer-card.md) — карточка финального ответа + ключ подписи в 8 словарях; исполнен и слит в `master` (2026-11-12).
- [tickets/transcript-readability/03-live-todo-dock.md](../../tickets/transcript-readability/03-live-todo-dock.md) — живой список дел; исполнен и слит в `master` (2026-11-12).
- [tickets/transcript-readability/05-reply-cards-final-bar.md](../../tickets/transcript-readability/05-reply-cards-final-bar.md) — карточки всех реплик и синяя полоса финала без подписи (приёмка макета оператором 2026-11-12); исполнен и слит в `master` (2026-11-12).
- [tickets/transcript-readability/04-replay-refresh-acceptance.md](../../tickets/transcript-readability/04-replay-refresh-acceptance.md) — replay-refresh и финальная приёмка; блокировки сняты (тикеты 1–3 и 5 слиты), следующий в очереди. Механический критерий диффа обновлён: подпись финала удалена тикетом 5 до refresh, в diff expected допустимы только строки прогресс-полосы в queue-actions/layout.expected.md.
- [docs/plans/verify-md-wrap-kb-scope.md](../plans/verify-md-wrap-kb-scope.md) — `draft`, блокировок нет, следующий шаг `/ship`. Он же последнее падение `pnpm run test:docs` (`markdown wrap`, 6 находок в `docs/ontology.md`).

## Что осталось

Отложенная работа: пункт с условием возврата.
- Чужие падения `test:gui` (2026-11-12, воспроизведены на чистом master): `ui-settings-account` — «renders Platform profile and recharge wallet balances», «formats 1234.56999 using Platform currency rules»; `ui-deliverables` — «states the summary and comparison that stand in for hunks, and retries a failed read». Условие возврата — следующий sweep окна PR; к юниту transcript-readability отношения не имеют.
- Тикет [docs/plans/verify-md-wrap-kb-scope.md](../plans/verify-md-wrap-kb-scope.md) — держать в очереди; условие возврата — `markdown wrap` снова красен на носителе KB.
- Запас в бюджете `AGENTS.md`: тело держит `2080 / 2080` без запаса, регион `AGENTS.md#ontoship` — `172 / 200`. Первый апстрим-мерж, добавивший в корневой `AGENTS.md` хотя бы слово, требует relocate или condense до подъёма планки; носитель правила — [docs/plans/doc-budgets-ontoship-region.md](../plans/doc-budgets-ontoship-region.md).

## Стартовый промпт

Текст, с которого открывается сессия: «Продолжай юнит transcript-readability по docs/ops/continue.md: тикеты 1–3 и 5 слиты в master, исполняй тикет 4 (replay-refresh и финальная приёмка)». Чек-лист фазовых переходов: вычитка спеки перед план-гейтом — скилл `grilling`; критик после нарезки — скилл `to-tickets`; ревью-панель перед merge — скилл `ship` (для тикетов 1–3 и 5 этого юнита заменена решением оператора от 2026-11-12; для тикета 4 приёмка оператором обязательна по спеке).
