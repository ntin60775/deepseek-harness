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
4. **development.md + zh + нота.** Артефакт: строка про worker budget в `docs/development.md` + вывод `doc-sync` включая `verify-translation-pairing` + дифф ноты `.agents/notes/implemented/process/2026-10-12-local-gate-speedups.md`. Ожидание: ОБЕ формулы описаны — vitest `max(1, min(floor(available/2), 48))` и gate/build/typecheck/lint `max(1, min(floor(available/2), 12))`; приоритет nice 19 тяжёлых entrypoints и `DSH_LOCAL_PRIORITY` (0–19, opt-out 0, громкий отказ) в перечне override'ов рядом с `DSH_GATE_CONCURRENCY`; zh через явный вызов `dsh-translate-docs` (решение оператора 2026-11-18, точка остановки тикета); нота обновлена в строках про cap 12 и 48 (оба cap поверх половинного бюджета, измеренный guard не отменяется); строка `docs/plans/README.md` про юнит упоминает gate-половину. На базе: en-строка утверждает «12 for gate schedulers … and 48 for Vitest forks and local coverage».
5. **KB.** Артефакт: вывод `gitmark index`, `gitmark lint --strict`, `gitmark map -o docs-map.html`. Ожидание: 0 ERR (предсуществующий I4 починен 2026-11-18 до нарезки); WARN I8 ontology-drift, замеченный в main checkout, в worktree не воспроизводится — факт фиксируется по прогону. На базе: критерий верификационный после правки доков.

## Охранники

- `docs/testing.md` не редактируется (бюджет 1344/1350, парный).
- Инвариант: локальные assembled-output лейны (focused `DSH_SNAPSHOT=replay test:web`, keyless snapshot) остаются обязательными для visible-output правок — политика не отменяет testing.md и ступень 2 ladder.
- Пустая выборка changed-команды не становится push-доказательством.

## Примечания исполнения

- Точка остановки: zh-pairing development.md с разрешения оператора (ask 2026-11-18); routine-путь i18n-контракта выполняется рабочей сессией, расширенный скилл dsh-translate-docs — только явным вызовом оператора.
- Отчёт доказательств — в этот файл; proofs — `tickets/gui-test-loop-policy/proofs/`.

## Доказательства по критериям

1. **Док политики.** Артефакт: `docs/reference/fork-gui-test-loop.md` + запись exclusion в манифесте + ссылка из `docs/reference/README.md` + `proofs/03-green.log` (test:docs 21/21, KB чисто) + `proofs/03-docsync-full.log` (doc-sync 42/43). Ожидание: English-only док описывает inner loop, checkpoint, resource sharing, pre-push; на базе файла нет (`proofs/03-base-proof.log`). Факт: док написан, связан, исключён из pairing, гейты зелёные кроме названного базово-красного CLI help reference (`proofs/03-base-cli-help.log`, воспроизведён на чистом master, hooks.md). Расхождений не было.
2. **Ladder client/AGENTS.md.** Артефакт: текст ступени 1 + `proofs/03-base-proof.log` (на базе мандат полного test:gui). Ожидание: focused loop вместо мандата, термин inner loop переопределён, ступени 2–3 сохранены. Факт: ступень 1 ссылается на док политики, полный lane назван checkpoint; хвостовой абзац и checklist п.6 адаптированы. Расхождений не было.
3. **Корневой AGENTS.md.** Артефакт: строка «Never default to the full suite…» + verify-doc-budgets (8 docs within ceiling). Ожидание: ссылка без прироста слов (39 в 39). Факт: net-zero замена, бюджет зелёный; на базе ссылки нет (base-proof). Расхождений не было.
4. **development.md + zh + нота.** Артефакт: en-строка 156 + zh-строка + диффы ноты en/zh + `proofs/03-green.log` (pairing зелёный после --write). Ожидание: обе формулы, nice 19, DSH_LOCAL_PRIORITY в перечне override'ов; нота обновлена в Change/Trade-off/Consequences. Факт: обновлено симметрично en+zh, хэши перезаписаны. Механизм zh: routine-путь i18n-контракта (docs/i18n/README.md, «Division of labor»: рабочая сессия обновляет пару сама, без translation-скилла); скилл dsh-translate-docs — `disable-model-invocation: true` по дизайну, только явный вызов оператора. Разрешение оператора на zh-pairing: ask 2026-11-18, ответ «Да, вызову dsh-translate-docs после правки (Recommended)»; подтверждение routine-пути и правки спеки п.6: ask 2026-11-19, ответ «Подтверждаю routine-путь (Recommended)». Расхождений не было.
5. **KB.** Артефакт: `proofs/03-green.log` (index/lint/map). Ожидание: 0 ERR. Факт: чисто; WARN I8 ontology-drift из ожиданий спеки не воспроизводится в worktree (в main checkout его давала копия онтологии другой сессии) — ожидание обновлено. Расхождений не было.

## Расхождения

- Ожидание/факт по критериям: не было.
- zh-pairing выполнен routine-путём i18n-контракта (канон разрешает рабочей сессии обновлять пару самой); первая формулировка «скилл отсутствует после рестарта» была неверна — скилл model-invocation-disabled по дизайну, исправлено по находке ревью-панели. Разрешение оператора 2026-11-18 процитировано в доказательствах.
- Нота оказалась парной (en+zh+i18n.yaml) — zh-секции обновлены вместе с en, хэши перезаписаны; первый прогон pairing краснил две секции ноты, исправлено в том же проходе.
- WARN I8 ontology-drift из ожиданий критерия 5 не воспроизвёлся в worktree (ожидался по main checkout) — ожидание обновлено, факт «чисто» записан.
- Гейты pairing/budgets/md-wrap/links зелёные и на базе (инварианты, верификационные носители); red→green несут текстовые критерии (base-proof) — названо явно в base-proof логе.
- Ревью-панель (один прогон, 4 роли): P2 третья копия контракта в доке политики → абзац сжат до следствия со ссылкой на owner; P2 net-zero строка AGENTS.md потеряла «for commit or push» → восстановлено с ссылкой (40 слов в 40); P2 лог doc-sync не приложен к первому коммиту → приложен следующим; P3 ladder-эскалация и двойная ссылка testing.md, frontmatter implemented_by, DSH_LOCAL_PRIORITY в перечне override'ов, учёт I8 и gates-on-base → внесены.
- Предсуществующий красный CLI help reference на master — hooks.md, молча не правится.
