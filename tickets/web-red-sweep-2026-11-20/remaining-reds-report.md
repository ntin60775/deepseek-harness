# Оставшиеся красные после sweep-refresh (2026-11-20)

Продолжение [report.md](report.md). Скоуп: вне 30 базовых web pool-файлов — serial-владельцы,
hygiene `rescope-vendor:check`, чужие `test:gui` красные и полный checkpoint `test:web`.
База: tip `master`, артефакты `build` 10/10, Node 24.

## Итог

| Пункт | Классификация | Фикс | Доказательство |
| --- | --- | --- | --- |
| `hmr-live` | environmental: локаль браузера | пин `en-US` страницы | проба страницы отдаёт ru-копию; после пина 1/1 |
| `client-plugin-live` | stale golden под намеренный fork Delete session | голден + hardcoded список через владельца | дифф ровно +1 строка |
| `rescope-vendor:check` | ложные срабатывания token-правила (2 сайта) | `GENERIC_SKIPS` | before 2 residue → after verified |
| ui-settings-account ×2 | не воспроизводится (type-фикс слит) | — | изолированно и по пакету зелёные |
| ui-deliverables review-tab | нагрузочный flake | — | изолированно и по пакету зелёный |
| полный `test:web` (первый прогон) | 7 файлов: 6 stale-пины/ожидания + 4 flake-кандидата | см. разделы 5–9 | лог `/tmp/lead-weblane.log` |
| `cwd` в `subagent`-схемах (7 сценариев) | stale pins под намеренную fork-фичу PR#12 | refresh через владельцев | диффы только `cwd` |
| `bonus-notice` | stale геометрия под fork-хайрлайн футера | замер + замена ассерта | проба 895/901/906 |
| `subagent-conversation` | upstream one-line rows + fork route line | hardcoded + refresh | дифф голденов 2 строки |
| `forge-panel` (worktree) | environmental: bwrap маскирует `/tmp` | — (CI ставит `TMPDIR=runner.temp`) | с `TMPDIR` вне `/tmp` — 1/1 |
| `forge-panel` (стрелки) | flake измерения против scroll anchoring | допуск `ANCHORING_DRIFT_PX = 44` | 5/5 изолированно |
| `session-drag-scroll` | тест снятой upstream-фичи (решение оператора) | файл удалён | `scroll-handoff.ts` в форке нет |
| полный `test:web` (финальный) | см. раздел 10 | — | CI-порядок, `TMPDIR` вне `/tmp` |

## 1. `hmr-live.e2e.ts` — таймаут `getByText` — environmental (локаль браузера)

Воспроизведено изолированно: `TimeoutError: locator.waitFor: Timeout 15000ms exceeded` на
`getByText('Into the Unknown', { exact: true })`, страница при этом жива.

Корень: клиентский сервис локали отдаёт приоритет языку браузера
(`packages/client/locale/src/client/index.ts`, `resolveInitialLocale` → `detectBrowserLocale`;
`navigator.languages` → `navigator.language`). На машине оператора браузер headless наследует
`ru`, поэтому hero рендерится русской копией, а тест ждал английскую строку из словаря `en`.
Проба страницы (`/tmp/hmr-probe.mjs`, built `dsh web`, пустой `DSH_HOME`) отдаёт
`Новая сессия … В неизвестность` — то есть HMR-сценарий рабочий, красным был только язык.
Это не баг продукта: приоритет языка браузера — намеренное поведение апстрима.

Фикс (тест): страница создаётся `newEnglishPage(browser)` вместо `browser.newPage()` — пин
`locale: 'en-US'`, как в остальных web-сценариях с английской копией. Правка `hmr-live.e2e.ts`
несёт комментарий с причиной.

Доказательство: до фикса — красный (лог выше), после — `1 passed` 21.5s изолированно и
`✓ apps/web/tests/hmr-live.e2e.ts (1 test)` в serial-стадии CI-порядка.

## 2. `client-plugin-live.e2e.ts:41` — stale golden под намеренный fork Delete session

Воспроизведено изолированно (`DSH_SNAPSHOT=replay`): `1 failed | 5 passed`. Дифф голдена
`apps/web/tests/expected/client-plugin-live/session-actions.expected.md` — ровно одна новая
строка `  - menuitem "Delete session"` после `Archive session`, то есть форк-поверхность
удаления сессий (сигнатура 1 sweep-отчёта). Никаких других строк дифф не содержит.

Владелец фикстуры — сам файл: он пишет голдены своим `compareOrRefreshGolden` и объявляет
`assertFixtureInventory(EXPECTED, …)` для `expected/client-plugin-live/`; borrower-ограничения
(`compareReplaySession: 'read-only'`) здесь нет. Refresh через владельца:
`DSH_SNAPSHOT=refresh … client-plugin-live.e2e.ts` — `git status` показал единственный
изменённый файл, ровно голден меню (остальные голдены файла не перезаписались).

Второй, hardcoded слой того же дрейфа: после снятия фикстуры меню проверяется списком
`remainingNames` и счётчиком; форк добавил `Delete session` после `Archive session` →
`expected 6 to be 7`. Список обновлён (`+ 'Delete session'`), счётчики сепараторов не менялись
(3 в первом меню с фикстурой, 2 во втором).

Доказательство: (а) до фикса — красный с диффом выше; (б) после — `6 passed` изолированно;
(в) в serial-стадии CI-порядка — `✓ apps/web/tests/client-plugin-live.e2e.ts (6 tests)`.
Механический критерий соблюдён: дифф голдена = только намеренная fork-сигнатура.

## 3. `rescope-vendor:check` — residue после rc3/rc5-мержей

На 2026-11-17 зацепа фиксировала 4 residue-файла; на текущем `master` их 2 (остальные
разошлись мержами). Оба — ложные срабатывания token-правила кодовмода, не «забытые»
переименования:

1. `apps/web/tests/client-config-sync.e2e.ts:43` — `join(installed, 'node_modules', '@deepseek-ai', 'schemastery')`.
   Голое имя здесь — имя каталога внутри скоупа `@deepseek-ai`, а не пакетный спецификатор;
   кодовмод дописал бы `/node_modules/@deepseek-ai/@deepseek-ai/schemastery` и сломал симлинк.
2. `docs/reference/fork-profile-config-validation.md:34` — перечисление preset-id
   (`preset-standard`/`ptc`/`minimal`/`cordis`); `cordis` — идентификатор агент-пресета,
   не пакет.

Оба случая покрыты документированной категорией `GENERIC_SKIPS` (`docs/rescope.md`: «preset IDs,
event names, directory group names»), поэтому фикс — две записи с комментарием причины,
а не правка кода теста/прозы под grep.

Проверено: `pnpm run rescope-vendor:check` → `post-state verified — no residue, every exact edit
landed, idempotent.`; `scripts/rescope-vendor.spec.ts` — 81/81.

Замечание: те же два сайта лежат и в `upstream/master` без skip-записей (проверено
`git show upstream/master:…`) — то есть residue приехал апстримом. Условие возврата: снять
skip, если апстрим перепишет эти сайты (каталог переедет или preset-id исчезнет из прозы).

## 4. Чужие `test:gui` красные — не воспроизводятся

- `packages/client/ui-settings-account/tests/account.client.spec.tsx` — «renders Platform profile
  and recharge wallet balances» (en+zh) и `formatBalance.client.spec.ts` — «formats 1234.56999»:
  изолированный прогон `86 passed`; пакеты `ui-settings-account` + `ui-deliverables` целиком —
  `34 files / 525 tests passed`. Форматирование корректно: `roundDown` у `1234.56999` → `¥1,234.56`,
  `0.00000100` → `<$0.01`. То есть запись в ops устарела после слияния type-фикса `formatBalance.ts`.
- `packages/client/ui-deliverables/tests/review-tab.client.spec.tsx` — «states the summary and
  comparison … and retries a failed read»: изолированно зелёный (1.5s), в полном пакете зелёный.
  Синхронный компонентный тест без сети/таймеров — воспроизвести нагрузочный flake не удалось;
  подтверждено как flake без продуктового дефекта, кода не трогали.

Остаточный риск назван: оба наблюдения сделаны на изолированных прогонах и на полных каталогах
пакетов, но не в полном `test:gui` (820 файлов) — при возврате красных в CI-лейне первым шагом
изолированный перепрогон, как и здесь.

## 5. Первый полный прогон `test:web` (CI-порядок)

`DSH_SNAPSHOT=replay DSH_WEB_SNAPSHOT_WORKERS=3 pnpm run test:web:ci`, default `TMPDIR=/tmp`:
serial-стадия 3/3 зелёная (`hmr-live` 1/1, `client-plugin-live` 6/6, `present-svg` 3/3), пул —
`11 failed | 243 passed | 3 skipped (257 files)`, `7 failed | 1095 passed | 26 skipped (1128 tests)`.
Лог: `/tmp/lead-weblane.log`.

Красные разложены на три причины: дрейф `cwd`-пинов (7 файлов), два stale-ожидания под
намеренные изменения UI (`bonus-notice`, `subagent-conversation`) и два environmental
(`forge-panel` — bwrap-`TMPDIR`, `session-drag-scroll` — фича, снятая форком). Каждый красный
перепроверен изолированно (не пулом) до классификации.

## 6. `cwd` в схемах `subagent`/`subagent_fork` — stale pins (7 сценариев)

Первый прогон покраснел на пинах `system-prompt.expected.md` / `tool-schemas.expected.json`
в `snapshots/web/`: `creation-recommendations`, `official-subagent-bundle`, `plugin-recommendations`,
`ptc-round`, `optional-string-editor` (тест `standalone-string-editor`), `creator-persona`,
`deepseek-chat-import`. Дифф во всех один: новый необязательный `cwd` с описанием
«Working directory for the subagent session …» в схемах обоих инструментов.

Корень: фича ветки PR #12 (`cwd` у `subagent/subagent_fork`) вошла в `master`, а sweep-refresh
20 ноября обновил только `snapshots/web/fresh-round-trip/tool-schemas.expected.json` через его
владельца — остальные сценарии, у которых пин системного промпта вшивает те же схемы, остались
stale. Реальный баг не при чём: сами схемы корректны, ожидания отстали.

Фикс — refresh владельцем каждого сценария (у каждого свой каталог `snapshots/web/<scenario>/`).
Механический критерий: `git diff --stat snapshots/web` = 7 файлов, **46 вставок, 0 удалений**;
все добавленные строки — `cwd` (проверено фильтром по диффу). После refresh — 7 файлов / 16
тестов зелёные.

## 7. `bonus-notice` — геометрия под fork-хайрлайн футера

Падение: `expected 895 to be greater than or equal to 901` — «карточка бонуса плавает над
списком сессий, список достаёт до её нижнего края». Замер (probe, revert'нут):
`listBottom=895`, карточка `y=796 h=106` (низ 902), кнопка аккаунта `y=906`.

Корень: форк добавил в футер сайдбара зону-хайрлайн `.footArea { border-top: .5px; padding-top: 6px }`
(`SidebarRoot.module.css`, коммит форка про рейл/зоны). Список кончается на верхней границе
футера (`895`), а кнопка аккаунта уезжает на 6px+0.5px вниз; карточка сидит ровно над кнопкой
(902) и эти 6px перекрывает. Намеренная fork-геометрия, не дефект: карточка — плавающий оверлей,
и визуально (`.artifacts/bonus-notice-update-tag.png`) она лежит над строкой аккаунта.

Ожидание обновлено по замеру: вместо `listBottom >= cardBottom - 1` теперь двусторонняя
проверка `listBottom < cardBottom < accountBox.y` с комментарием, называющим зону футера.
Ложного «прошло» нет: до правки ассерт падал, после — 1/1 зелёный.

## 8. `subagent-conversation` — upstream one-line rows + fork route line

Два падения одного файла:
1. Карточка-ховер строки: ожидались дети `[label, Owner, status]`, пришло
   `[label, Owner, 'Model route: …', status]`. Корень — fork-фича route-visibility: строка маршрута
   вставлена в `PanelDetailsProps.lines` перед статусом (`SubagentCatalog.tsx`, комментарий
   «The dense Session-panel row hides the inline route; its hover card carries the same recorded
   provider, model, and effort»). Hardcoded-ожидание обновлено на 4 элемента.
2. Голдены `disclosures.expected.md` и `tree.expected.md`: внутренний текст строки дерева
   стал `label + {{duration}}` вместо `label · name · mode · route · tokens · duration`.
   Корень — upstream-рефактор панели: `SubagentsSection` передаёт `panelDetails`, поэтому строки
   каталога рендерятся `dense` (одна строка + ховер-карточка), а `aria-label` строки сохраняет
   полный набор (он в голдене не изменился). Порядок соблюдён: сначала hardcoded-ассерт, затем
   refresh голденов.

Дифф голденов — ровно 2 строки (по одной в каждом файле), других изменений нет; после —
18/18 зелёные.

## 9. `forge-panel` (worktree-сессия) — environmental: bwrap маскирует `/tmp`

Падение: таймаут `getByText('工作树 · 基于 release')`; probe показал, что панель рендерит
ветку «работа без дерева» (`工作树不可用` + «恢复»). Дальше probe внутри
`missingWorktree` (`client-ui-forge/src/panel.ts`) дал точную причину:
`git rev-parse --show-toplevel` из рабочего дерева возвращает
`fatal: not a git repository: <workspace>/workspace/.git/worktrees/<branch>` (exit 128),
хотя `ctx.fs.lstat` каталог видит и `within()` истинно.

Корень — не продукт: политика сессии ставит `workspaceRoot` = cwd сессии (рабочее дерево), а
Linux-профиль bwrap сначала `--ro-bind / /`, затем `--tmpfs /tmp` и возвращает только writable
корни (`profiles.ts`). Когда e2e-мир создан в `/tmp` (`mkdtemp(tmpdir())`), соседний проект
`<workspace>/workspace` вместе с его `.git` в песочнице не виден — git честно отвечает «not a
git repository». На macOS (Seatbelt читает всё) и на обычных путях вне `/tmp` дефекта нет.
CI апстрима/форка обходит это сам: `echo "TMPDIR=${{ runner.temp }}"` в `ci.yml`.

Доказательство: тот же тест с `TMPDIR` вне `/tmp` — `1 passed`; probe печатает
`exitCode: 0` и строку `工作树 · 基于 release`. Пробы из `panel.ts` и теста сняты
(`git checkout -- packages/experimental/client-ui-forge/src/panel.ts`).

Побочное условие, найденное тем же прогоном: `TMPDIR` не должен лежать **внутри репозитория**.
С `TMPDIR=<repo>/.artifacts/tmp` мир e2e наследует корневой `AGENTS.md` (контекст-инъекция
`上下文注入 AGENTS.md` в `present-svg`) — рабочий каталог получает родительские инструкции,
которых у него быть не должно: Session резолвит все `AGENTS.md` вверх по дереву, и для мира
внутри чекаута это корректное поведение продукта, а не дефект.

Вылечено в харнессе, а не инструкцией в голове: `webWorldRoot()` в `apps/web/tests/support.ts`
отдаёт OS-temp, только если тот вне чекаута и не `/tmp` на Linux; иначе миры живут в
`/var/tmp/dsh-web-worlds-<uid>`. `launchWebScaffold` создаёт там и рабочий мир, и root
персистентности. Доказательства: `present-svg` с `TMPDIR=<repo>/.artifacts/tmp2` — 3/3 зелёных
(утечки `AGENTS.md` нет); `forge-panel` worktree с дефолтным `TMPDIR=/tmp` — 1/1 зелёный
(песочница больше не прячет репозиторий). Инвариант закреплён спекой
`apps/web/tests/world-root.spec.ts` (2/2) и записан в регламент web-лейна —
`.agents/notes/implemented/testing/2026-07-24-web-gui-browser-e2e-lane.md` (+ zh-пара, пейринг
перезаписан); `docs/testing.md` ссылается на эту ноту и в бюджет не раздувается.

## 10. `forge-panel` — горизонтальные стрелки: дрейф scroll anchoring

После фикса `TMPDIR` в том же файле остался один красный: «uses horizontal arrows to navigate files
while preserving vertical scrolling and comment editing» — `expected 3321 to be 3347` на проверке,
что переход к следующему файлу не сдвигает вертикальный скролл.

Изолированно тест **недетерминирован**: 3 прогона — 2 зелёных, 1 красный с теми же значениями
(3321/3347). Probe по времени после нажатия: `t0=3347 → +2 rAF: 3347 → +500ms: 3321` (в другом
прогоне `t0` уже 3321). То есть браузерный scroll anchoring сдвигает позицию на 24–26px уже после
того, как тест снял `lastPosition`; к «верху списка» скролл не возвращается (инвариант, ради
которого тест и написан, выполняется).

Замер единиц: строка диффа `[data-diff-line]` — 22px, заголовок файла — 36px, наблюдаемый дрейф
0–26px, то есть меньше одной пары строк. Ассерт заменён на `|Δ| ≤ 44px` (одна пара строк диффа)
плюс `scrollTop > 0`; константа `ANCHORING_DRIFT_PX` названа в тесте с обоснованием. 5 повторных
прогонов изолированно — 5/5 зелёных. Продуктовый код не менялся: это гонка измерения с
scroll anchoring, а не дефект панели.

## 11. `session-drag-scroll` — тест снятой upstream-фичи (удалён)

Тест приехал с rc.5-мержем (upstream PR #8619: drag-edge autoscroll внутри `scroll-handoff.ts`,
полоса 48px, rAF-цикл по `dragover`). Форк эту двухуровневую модель сайдбара не несёт: коммит
`feat(client): sidebar session scroller with visible rail, zones, and Windows-style arrows`
(2026-11-15) удалил `scroll-handoff.ts` вместе со спекой и ввёл один скроллер списка + видимый
рейл + кнопки-стрелки; при мерже rc.4 решение подтверждено («drag-handoff остаётся удалён»).
Тест требует того, чего в форке нет: `[data-sidebar-scrollport]` у форка — `.scrollArea` с
`overflow: hidden` (никогда не скроллится), JS-обработчиков `dragover`/`wheel` в
`ui-sidebar`/`ui-workspace` нет, замер: курсор в 4px от низа списка, draggable-строка под ним,
`scrollTop` остаётся 0.

Решение оператора 2026-11-22: файл удалён вместе с двумя записями в `tsconfig.host.json` и
`apps/web/tsconfig.json`. Рейл форка остаётся покрыт `sidebar-scrollbar.e2e.ts`; DnD-перестановка
сессий сохраняется, теряется только автоскролл у краёв (докрутка стрелками).

## Финальный прогон

`DSH_SNAPSHOT=replay DSH_WEB_SNAPSHOT_WORKERS=3 pnpm run test:web:ci` с дефолтным `TMPDIR`
(CI-порядок: serial-владельцы по одному, затем пул `--fileParallelism --maxWorkers=3`), лог
`/tmp/lead-weblane5.log`: serial — `hmr-live` 1/1, `client-plugin-live` 6/6, `present-svg` 3/3;
пул — **253 passed / 3 skipped (256 файлов), 1101 passed / 26 skipped, 0 failed**, 26 мин; serial-стадия 3/3.
Этот прогон идёт уже после правки `webWorldRoot`, то есть без ручного `TMPDIR`.. Гейты вокруг правок: `build` 10/10 (`build:artifacts` + `build:check`), `build:check`
после последних правок 2/2, `test:docs` 21/21, `pnpm run rescope-vendor:check` — verified,
`scripts/rescope-vendor.spec.ts` 81/81, oxlint по тронутым файлам — 0.

Первый полный прогон (default `TMPDIR`, до правок) — `11 failed | 243 passed | 3 skipped`,
`7 failed | 1095 passed | 26 skipped`; все красные разобраны в разделах 5–11, ни один не
замаскирован: контент-диффы голденов проверены построчно, у геометрии сняты замеры, у
environmental названа причина и условие прогона.

## Условия возврата

- `test:web` полный лейн: зелёный по серийной и пуловой стадиям → пункт считается снятым;
  любой красный — изолированный перепрогон и классификация (как в этом отчёте).
- `rescope-vendor`: skip-записи снимаются при переписывании апстримом соответствующих сайтов.
- `test:gui`: чужие красные не воспроизводятся; возврат — при первом красном в лейне, тогда
  изолированный прогон до вердикта.
- `cwd`-пины `snapshots/web/*`: следующий дрейф схем инструментов — refresh владельцем сценария
  (не только `fresh-round-trip`), критерий тот же: дифф только ожидаемое свойство.
- `bonus-notice`: ассерт держится на fork-зоне футера (`.footArea`: hairline + 6px). Смена
  геометрии футера → новый замер, не подгонка.
- `forge-panel`: мирам нужен репозиторий за пределами cwd сессии, поэтому любое возвращение мира
  под `/tmp` на Linux или внутрь чекаута снова покраснит сценарий. Держит `webWorldRoot`
  (`apps/web/tests/support.ts`, спека `world-root.spec.ts`); ручной `TMPDIR` такого вида
  игнорируется.
- `session-drag-scroll`: теста нет (удалён 2026-11-22). Если форк когда-нибудь вернёт
  upstream-скролл-модель, тест приезжает снова вместе с `scroll-handoff.ts`.
