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

## Порядок тикетов

Юниты и тикеты в порядке исполнения; блокировки отмечены.

- [docs/plans/verify-md-wrap-kb-scope.md](../plans/verify-md-wrap-kb-scope.md) — `draft`, блокировок нет, следующий шаг `/ship`. Он же последнее падение `pnpm run test:docs` (`markdown wrap`, 6 находок в `docs/ontology.md`).

## Что осталось

Отложенная работа: пункт с условием возврата.
- Тикет [docs/plans/verify-md-wrap-kb-scope.md](../plans/verify-md-wrap-kb-scope.md) — держать в очереди; условие возврата — `markdown wrap` снова красен на носителе KB.
- Запас в бюджете `AGENTS.md`: тело держит `2080 / 2080` без запаса, регион `AGENTS.md#ontoship` — `172 / 200`. Первый апстрим-мерж, добавивший в корневой `AGENTS.md` хотя бы слово, требует relocate или condense до подъёма планки; носитель правила — [docs/plans/doc-budgets-ontoship-region.md](../plans/doc-budgets-ontoship-region.md).

## Стартовый промпт

Текст, с которого открывается сессия. Чек-лист фазовых переходов: вычитка спеки перед план-гейтом — скилл `grilling`; критик после нарезки — скилл `to-tickets`; ревью-панель перед merge — скилл `ship`.
