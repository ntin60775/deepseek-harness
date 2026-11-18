# Тикет 02 — Команда test:gui:changed

Блокеры: нет (тикет 01 улучшает демо, но не блокирует).
Спека: [docs/plans/gui-test-loop-policy.md](../../docs/plans/gui-test-loop-policy.md), пункт «Готово» 2.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Правлю src-файл `packages/client/ui-mermaid`, запускаю `pnpm run test:gui:changed` — команда выбирает и гоняет только related-спеки затронутого пакета, печатает выборку. Удаляю src-файл — команда гоняет весь spec-scope его пакета. Ничего не менял — «0 tests selected», exit 0. Новая незакоммиченная спека в tests/ попадает в выборку и исполняется.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Команда существует.** Артефакт: строка `test:gui:changed` в `package.json` + файл `scripts/run-gui-changed.ts` + вывод запуска. Ожидание: скрипт (tsx) собирает tracked-изменения `git diff HEAD` (включая staged) и untracked `src/**/*.{ts,tsx}` без `*.d.ts` плюс untracked `tests/**/*.{spec,test}.{ts,tsx}` в scope `packages/client` + `packages/host`, передаёт существующие файлы в `vitest related --run`. На базе: команды и скрипта нет.
2. **Fixture-спека выборки.** Артефакт: вывод vitest `scripts/run-gui-changed.spec.ts` на fixture git-репозитории. Ожидание: кейсы tracked-правка, untracked-новый src, untracked-новая спека (исполняется сама), `.d.ts` отсечён, правка вне scope печатается числом, пустой diff → «0 tests selected» exit 0. На базе: спека красная (скрипт отсутствует).
3. **Правило удалений.** Артефакт: fixture-кейс удаления + вывод запуска. Ожидание: удалённый путь в пакете → полный spec-scope пакета (`vitest run <pkg>`), удалённые пути не передаются в related (related молча игнорирует несуществующие файлы и принудительно ставит passWithNoTests — эмпирика гейта проекций). На базе: кейс красный.
4. **Честная слепая зона.** Артефакт: fixture-кейс «изменённый файл есть, related-тестов ноль» + вывод. Ожидание: явное предупреждение со слепыми зонами related (config, dynamic loading, subprocesses, built artifacts) и указанием выбрать owning-тесты вручную; exit 0; вывод не является доказательством для push. На базе: кейс красный.
5. **Живая проба.** Артефакт: вывод `pnpm run test:gui:changed` после реальной правки src-файла client-пакета на дереве тикета. Ожидание: выбранные спеки соответствуют затронутому пакету, прогон зелёный; критерий верификационный (base-proof несут критерии 1–4).

## Охранники

- Голый `vitest --changed` не используется (игнорирует path-фильтр, шумит от untracked build-артефактов — спайк 2026-11-18).
- Одно детерминированное правило выбора: без fallback-веток; удаления → пакетный scope, не деградация.
- Правила dsh-pre-push-checks не меняются: пустая выборка и предупреждение — сигналы dev-loop, не push-доказательство.

## Примечания исполнения

- Прецеденты fixture-git спек: `scripts/translation-pairing.spec.ts`, `scripts/rescope-vendor.spec.ts`.
- Отчёт доказательств — в этот файл; proofs — `tickets/gui-test-loop-policy/proofs/`.