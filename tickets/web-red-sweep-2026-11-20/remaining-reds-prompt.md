# Старт-промпт: расследование оставшихся красных тестов DSH

Скопируй в новую сессию. Самодостаточен; источник истины — файлы репо, не пересказ.

---

Продолжай расследование красных тестов DSH после sweep-refresh 2026-11-20. Контекст: sweep закрыл 30 базовых красных web pool-сценариев (post-rc3) до зелёного — отчёт-доказательство `tickets/web-red-sweep-2026-11-20/report.md`, ops-состояние `docs/ops/continue.md` (раздел «Что осталось», строка про базовые красные web). Ветка `master`, remote SSH `git@github.com:ntin60775/deepseek-harness.git`, sweep закоммичен и запушен (`70405aa9cd` table-фича, `b487a5245e` sweep). WebKit установлен (`webkit-2311`, playwright 1.61.1) + системная `libwoff1`; WebKit-arms прогоняются.

Твоя задача — расследовать ОСТАВШИЕСЯ красные (вне скоупа web pool sweep), классифицировать каждый: environmental / load-flake / stale expected под намеренное изменение / РЕАЛЬНЫЙ баг. Реальные баги — корневая причина + фикс; stale expected — обновлять только по механическому критерию (дифф = только намеренное изменение), НЕ маскировать баги. Решение оператора по скоупу: чинить или осознанно пропускать с пометкой в KB — спорное выноси ask'ом, молча не решай.

## Оставшиеся красные

1. **Serial web-сценарии** (CI-лейн `test:web:ci` останавливается на serial-стадии; гоняются отдельно, `fileParallelism:false`):
   - `apps/web/tests/hmr-live.e2e.ts` — таймаут `getByText` fixture-текста (воспроизведён на базе 2026-11-16, hooks.md юнита mermaid-fence-render). Serial-владелец.
   - `apps/web/tests/client-plugin-live.e2e.ts:41` — «keeps ordered legacy Session menu rows before Archive and removes them with their fiber»: голден получает лишнюю строку `Delete session` (fork-поверхность удаления сессий, воспроизведено 2026-11-17). Вероятно stale golden под намеренный fork Delete session — найди write-capable владельца фикстуры (borrowers read-only не пишут; паттерн: sweep нашёл владельца `replay-round-trip` для fresh-round-trip через `compareReplaySession: true` в scaffold.ts). Обнови голден через владельца, ревью диффа (только +Delete session).

2. **Hygiene**: `pnpm run rescope-vendor:check` (`tsx scripts/rescope-vendor.ts --check`) — 4 residue-проблемы после rc3-мержа (воспроизведено 2026-11-17): `docs/upgrade-guide/v0.2.2-rc.1/subagent-interrupt-default/guide.zh.md`, `packages/experimental/cua/tests/agent-scopes.spec.ts` и др. (точный список — прогон). Разбери residue: что за файлы, почему осели, корректный rescope.

3. **Чужие `test:gui` красные** (компонентный лейн, воспроизведены на чистом master 2026-11-12, ops:89; к sweep отношения не имеют):
   - `packages/client/ui-settings-account/tests/account.client.spec.tsx` — «renders Platform profile and recharge wallet balances» + «formats 1234.56999 using Platform currency rules» (форматирование баланса/валюты; ops упоминает слитый фикс type-ошибки `formatBalance.ts`). Выясни: реальный баг форматирования / locale / сеть-зависимость.
   - `packages/client/ui-deliverables/tests/review-tab.client.spec.tsx` — «states the summary and comparison that stand in for hunks, and retries a failed read» (нагрузочный flake, в позже прогонах не повторялся). Изолированный перепрогон → зелёный? Подтверди flake или найди корень.

4. **Полный `test:web` checkpoint** (~230 файлов) целиком не прогонялся после sweep. Sweep верифицировал 30 red + 7 borrowers cwd-фикстуры + table-impact (только thinking-markdown). Прогони полный лейн (`DSH_SNAPSHOT=replay pnpm run test:web` или CI-порядок пул `--fileParallelism --maxWorkers=3`, serial-владельцы отдельно) — выяви любые новые/пропущенные красные, классифицируй. Table-фича (contained block + expand) могла затронуть другие wide-table голдены — проверь.

## Метод и дисциплина (уроки sweep)

- **Изолируй перед вердиктом:** красные файлы гоняй по одному (`DSH_SNAPSHOT=replay pnpm exec vitest run --config vitest.web.config.ts apps/web/tests/<file>.e2e.ts`), не пулом, пока не классифицируешь. Нагрузочные таймауты ≠ реальные баги (hooks.md: 7 файлов упали под нагрузкой, изолированно 8 зелёных). Щадить машину — оператор предпочитает изолированные прогоны.
- **Механический критерий refresh:** `DSH_SNAPSHOT=refresh` пишет голдены/фикстуры только у write-capable владельца (`compareReplaySession: true`; read-only borrowers не пишут — scaffold.ts:1038 форсит replay). Дифф голдена должен содержать ТОЛЬКО намеренные fork-сигнатуры (Delete session, Queued/queue-dock, reply-card padding, compact pill, cwd). Неожиданный дифф БЛОКИРУЕТ refresh → расследуй (возможен реальный баг).
- **Ordering:** сначала чини hardcoded test-expectations (геометрия/counts), ПОТОМ refresh голденов. Иначе refresh снимает голдены в сломанном состоянии (каскад: тест обрывается на раннем ассерте →后续 контекст не append'ится → голден без него). Пример sweep: seeded-history геометрия +26 до refresh aria.
- **Каскады:** падение раннего ассерта обрывает тест → позже-ассерты/голдены падают каскадно (lifecycle-chrome materialized/recovers 0>=1 = каскад hero-golden; seeded-history Context-row = каскад геометрии). Чини корень, не каскад.
- **Не маскировать баги:** если дифф/падение показывает РЕАЛЬНЫЙ баг продукта (или твоей фичи) — flagни и чини КОД, не тест. Пример sweep: thinking-markdown вскрыл content-box overflow wide-table в table-фиче → фикс `box-sizing: border-box` в коде, тест contained=true корректен.
- **Замеры:** geometry-ассерты обновляй только с браузерным замером + исходник CSS (паттерн: субагенты мерили boundingBox, сверяли с Rows.module.css/ChatGroupSeat.module.css). Probe revert'ай после замера.

## Окружение и команды

- Node 24 (ритуал пинит), `pnpm`. Артефакты: `pnpm run build:artifacts` затем `pnpm run build:check` (TS aggregate). GUI: `pnpm run test:gui:changed` (git-diff related). Docs: `pnpm run test:docs` (pairing: `verify-translation-pairing --write <file>` для подтверждённой пары, не --all вслепую).
- Pre-push: скилл `dsh-pre-push-checks` (узкие гейты, не повторять пройденные). Push ТОЛЬКО по команде оператора; remote SSH. Коммиты по темам, pre-commit hook (staged lint/whitespace/pairing).
- Чужой незакоммиченный WIP `docs/ops/pi-ai-route-reasoning-defaults.md` (другая сессия) — НЕ трогать/не коммитить.

## Deliverable

Отчёт-доказательство (паттерн `tickets/web-red-sweep-2026-11-20/report.md`): по каждому красному — классификация + корневая причина + доказательство (замер/дифф/исходник) + фикс или обоснованный skip. KB-пометка в `docs/ops/continue.md` (что снято, что осталось, условие возврата). Финальный прогон затронутого лейна зелёный. Реальные баги — явно назвать, не маскировать. Спорные решения (скоуп, skip vs fix) — ask оператора.