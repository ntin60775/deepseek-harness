# Тикет 03 — Политика inner loop и правдивость доков

Блокеры: тикеты 01 (формула бюджета существует) и 02 (команда test:gui:changed существует) — док описывает реально существующие механизмы.
Спека: [docs/plans/gui-test-loop-policy.md](../../docs/plans/gui-test-loop-policy.md), пункты «Готово» 3–7.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Агент в новой сессии правит GUI-компонент и, читая ladder `packages/client/AGENTS.md`, запускает focused-прогон вместо полного `test:gui`; док `docs/reference/fork-gui-test-loop.md` описывает цикл правка→проверка (watch для человека, one-shot для агента, визуальная проверка через dev:web HMR). `doc-sync` и `gitmark lint --strict` зелёные; development.md и нота описывают действующую формулу бюджета.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Док политики.** Артефакт: файл `docs/reference/fork-gui-test-loop.md` + запись в `excluded` `scripts/translation-pairing.manifest.json` + ссылка из `docs/reference/README.md` + вывод `verify-translation-pairing --list` и `doc-sync`. Ожидание: English-only док описывает inner loop (явный `vitest watch` для терминала человека — vitest 4 не включает watch в не-TTY; one-shot focused/`-t`/changed для агента), обязательные локальные assembled-output лейны для visible-output правок, pre-push по dsh-pre-push-checks, полный `test:gui` только по явному запросу (включая критерии ship-тикета/спеки), диагностике CI или cross-cutting diff. На базе: файла нет.
2. **Ladder client/AGENTS.md.** Артефакт: текст секции «Before you push: the local check ladder» в `packages/client/AGENTS.md` + вывод `doc-sync`. Ожидание: ступень 1 — focused/watch/changed по доку политики вместо мандата полного `test:gui` на каждое GUI-изменение; термин «inner loop» переопределён; ступени 2 (test:web) и 3 (pre-push) сохранены; строка про красный test:gui на чужом коде адаптирована. На базе: ступень 1 мандатит полный прогон (текстовое ожидание не выполнено).
3. **Корневой AGENTS.md.** Артефакт: строка «Never default to the full suite…» в `AGENTS.md` + вывод `verify-doc-budgets`. Ожидание: ссылка на док политики вшита в существующую строку без прироста слов (бюджет 2080/2080, headroom 0). На базе: ссылки нет; новая отдельная строка гарантированно краснит бюджет.
4. **development.md + zh + нота.** Артефакт: строка про worker budget в `docs/development.md` + вывод `doc-sync` включая `verify-translation-pairing` + дифф ноты `.agents/notes/implemented/process/2026-10-12-local-gate-speedups.md`. Ожидание: формула `max(1, min(floor(available/2), 48))` описана в en и zh (zh через явный вызов `dsh-translate-docs` — решение оператора 2026-11-18, точка остановки тикета); нота обновлена: 48 остаётся memory-cap поверх половинного бюджета, измеренный guard не отменяется. На базе: en-строка утверждает «48 for Vitest forks and local coverage».
5. **KB.** Артефакт: вывод `gitmark index`, `gitmark lint --strict`, `gitmark map -o docs-map.html`. Ожидание: 0 ERR (предсуществующий I4 починен 2026-11-18 до нарезки); WARN I8 ontology-drift предсуществующий, вне объёма, называется пробелом. На базе: критерий верификационный после правки доков.

## Охранники

- `docs/testing.md` не редактируется (бюджет 1344/1350, парный).
- Инвариант: локальные assembled-output лейны (focused `DSH_SNAPSHOT=replay test:web`, keyless snapshot) остаются обязательными для visible-output правок — политика не отменяет testing.md и ступень 2 ladder.
- Пустая выборка changed-команды не становится push-доказательством.

## Примечания исполнения

- Точка остановки: явный вызов `dsh-translate-docs` оператором для пары development.md; без вызова zh-пара не правится и критерий 4 не закрыт.
- Отчёт доказательств — в этот файл; proofs — `tickets/gui-test-loop-policy/proofs/`.