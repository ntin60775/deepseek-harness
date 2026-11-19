# Тикет 03 — Гайды и профиль

Блокеры: 02 (мерж влит, иначе база всё ещё задаёт провайдера поиска сама).
Спека: [docs/plans/upstream-sync-rc5.md](../../docs/plans/upstream-sync-rc5.md), пункт «Готово» 4.
Гейт проекций: [projections.md](projections.md) (находки 24–28, 30–33).

## Демо-путь

`pnpm dsh --profile web --dump-config` печатает строку `web` с обоими ключами под меткой профильного патча и без предупреждения `patch:`, страница Web search and fetch в Settings показывает выбранный DeepSeek Search API, а focused-спеки песочницы доказывают, что граница `workspace-write` следует за рабочим каталогом и грант `.git` её расширяет.

## Критерии приёмки (падают на базовом коммите)

1. **Строка пина.** Артефакт: фрагмент `/home/prog7/.dsh/profiles/web/cordis.patch.yml` в отчёте тикета. Ожидание: НОВЫЙ top-level элемент `- id: web` с `name: "@deepseek-ai/dsh-web"` и `config: {searchProvider: deepseek-search-api, fetchProvider: http}`; не `insert:`, не правка несуществующей строки. На базе: строки `web` в профиле нет, пин не существует.
2. **Применение.** Артефакт: `pnpm dsh --profile web --dump-config`. Ожидание: у строки `web` оба ключа и метка профильного патча; выхода `patch: ... not found` нет. На базе: после мержа строка `web` несёт только `fetchProvider`. Доказательство снимается на копии `DSH_HOME` или overlay'ем до записи в живой профиль.
3. **Схема не ломается.** Артефакт: `pnpm dsh --profile web --dump-config-schema`, критерий — exit code, не подстрока. Ожидание: конфиг проходит схему; строка `invalid config:` отсутствует. На базе: инвариант — до правки тоже проходит, поэтому критерий только охраняет форму пина.
4. **Песочница.** Артефакт: `pnpm run test -- packages/sandbox/sandbox-policy/tests/workspace-root.spec.ts packages/experimental/worktree/tests/sandbox.spec.ts`. Ожидание: зелёные и не пропущены (`describe.skipIf` не сработал). На базе: спеки зелёные — инвариант апстрима; при потере гайдом смысла краснеют.
5. **Вывод по песочнице записан.** Артефакт: раздел отчёта тикета. Ожидание: сказано, что `danger-full-access` с `defaultPreset` есть только у `web`, а `headless` и `sdk` получают `workspace-write` с approval из base, поэтому SDK `setWorkingDirectory` двигает границу и грант `.git` им нужен; субагенты наследуют режим родителя. На базе: утверждение спеки о «всех профилях на danger-full-access» ложно.
6. **Два нерелевантных гайда закрыты.** Артефакт: раздел отчёта тикета. Ожидание: `forge-rate-limited-failure` и `client-hmr-plugin-events-stream` не касаются форка — `grep` по `~/home/dev/dsh-plugins` и `packages/fork` пуст по `ForgeFailure['code']`, `/plugins/events`, `EVENTS_ENDPOINT`. На базе: проверок нет.
7. **Маршруты.** Артефакт: раздел отчёта. Ожидание: сказано, на каких маршрутах пин держит поведение (`deepseek-official`/`deepseek-account`) и где он no-op (`qwen-token-plan-deepseek`). На базе: не сформулировано.

## Охранники

- Патч профиля не коммитится в репозиторий, но его точные строки лежат в отчёте тикета — иначе изменение вне git не ревьюится.
- `config` строки заменяется целиком: оба ключа обязательны, второй не «на будущее».
- Правка профиля применяется HMR-ом к `:3080`; проверка идёт на копии/overlay'ем до записи.
- `DSH_*` и ключи не попадают в `.env` и в артефакты.

## Примечания исполнения

- `--dump-config-schema` печатает схему и не содержит значений; доказательством применения служит `--dump-config`.
- При exit code 1 pnpm дописывает `[ELIFECYCLE]` в stdout — JSON парсится до этой строки.
- Отчёт доказательств — в этот файл; фрагменты — `tickets/upstream-sync-rc5/proofs/`.

## Отчёт исполнения (2026-11-19)

### Что сделано

- В живой профиль `~/.dsh/profiles/web/cordis.patch.yml` добавлен НОВЫЙ top-level элемент `- id: web` с `name: "@deepseek-ai/dsh-web"` и полным `config: {searchProvider: deepseek-search-api, fetchProvider: http}` (не `insert:`, не правка несуществующей строки). Точные строки:

  ```yaml
  # Web search stays on the DeepSeek Search API for every model route: the base
  # composition no longer pins a provider (docs/upgrade-guide/v0.2.2-rc.4/web-search-deepseek-model-default).
  - id: web
    name: "@deepseek-ai/dsh-web"
    config:
      searchProvider: deepseek-search-api
      fetchProvider: http
  ```

- Пин сначала проверен на копии `DSH_HOME=/home/prog7/.dsh-probe` (та же глубина, что `~/.dsh`; скопированы `package.json`, `cordis.yml`, `cordis.patch.yml`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `node_modules`; сессии и credentials не копировались), затем записан в живой профиль. Правку профиля перечитывает `dsh-hmr` из base (`packages/boot/hmr/src/watch-config.ts` следит за профильными патчами); ключ `patchReload` в дереве не читается и удалён из профиля. `:3080` не рестартился и не гасился.
- Три гайда прочитаны; выводы ниже. `v0.2.2-rc.4/web-search-deepseek-model-default` обработан пином; `v0.2.2-rc.4/workspace-write-boundary-follows-root` разобран по профилям; `v0.2.2-rc.4/forge-rate-limited-failure` и правка `v0.2.2-rc.3/client-hmr-plugin-events-stream` форка не касаются.

### Критерии приёмки

1. **Строка пина.** Фрагмент выше; строки `web` в профиле до этого не было (`grep` пуст), `insert:` не используется.
2. **Применение.** На копии: слой профиля помечен `patched by /home/prog7/.dsh-probe/profiles/web/cordis.patch.yml`, у строки `web` оба ключа, `patch:`-предупреждений нет, exit 0. После записи в живой профиль то же на `~/.dsh` — [proofs/03-dump-config.log](proofs/03-dump-config.log).
3. **Схема.** `--dump-config-schema` на копии: exit 1, `invalid config:` — 0, 5 `unrecognized Loader tree carrier` на путях `/204–207` и `/233` (несущий слой, не конфиг). Baseline без пина — те же exit 1 и 5 carrier-ошибок: пин не добавляет ни carrier, ни config-ошибку. Уникальных путей с carrier-диагностикой — 5 (`/204–207`, `/233`), строк с сообщением — 10; множество пином не изменилось; схема валидирует `searchProvider`/`fetchProvider` только как `string|null`, валидность значений держат `--dump-config` и экран Settings ([proofs/03-dump-config.log](proofs/03-dump-config.log)).
4. **Песочница.** `LANG=C LC_ALL=C node_modules/.bin/vitest run packages/sandbox/sandbox-policy/tests/workspace-root.spec.ts packages/experimental/worktree/tests/sandbox.spec.ts --maxWorkers 1` — 2 файла, 9 passed, 0 skipped, лог [proofs/03-sandbox.log](proofs/03-sandbox.log). Форма `pnpm run test -- <пути>` фильтр не пробрасывает (pnpm отдаёт `vitest run -- <пути>`, гоняется весь набор); форма без `--` работает. На дефолтных 5 с Vitest 4.1.11 несколько тестов `worktree` (в наблюдении четыре) падали по таймауту, пока параллельно шёл build ритуала; на разгруженной машине тот же набор зелёный на дефолте и на `--testTimeout=20000`, тесты не пропущены. `LANG=C` обязателен: при русской локали git отвечает по-русски, и regex теста на `permission denied` не совпадает.
5. **Вывод по песочнице.** `danger-full-access` с `defaultPreset` есть только у профиля `web` (`~/.dsh/profiles/web/cordis.patch.yml`); `headless` и `sdk` держат пустой список пресетов и получают `workspace-write` + approval `ask` из base (`packages/bundle/base/cordis.patch.yml`, `sandbox-policy.mode ?? 'workspace-write'`, `approval.policy ... ? 'never' : 'ask'`). Поэтому граница `workspace-write` следует за рабочим каталогом и у SDK `setWorkingDirectory` (`packages/sdk/client/src/api.ts:248`), и грант `.git` нужен `headless`/`sdk` уже сейчас; worktree-инструмента у них нет, границу двигает SDK `setWorkingDirectory` (или перемещение cwd). Субагенты получают явный `sandboxMode` родителя и approval pin (`packages/subagent/subagent/src/child-agent.ts:245-284`, approval policy — `:259`, канал `permissionPreset` — `:255` и `:282-284`), а изнутри эскалаций не имеют — «operations that require approval are rejected automatically» в их runtime-контексте (`:173`).
6. **Два нерелевантных гайда.** `grep -rEn "ForgeFailure\['code'\]|/plugins/events|EVENTS_ENDPOINT"` по `~/home/dev/dsh-plugins` и `packages/fork` — 0 совпадений: плагины форка не коммутируют по `ForgeFailure['code']`, не читают `/plugins/events`/`EVENTS_ENDPOINT` и вызывают `apply(ctx)` без второго параметра (`omp-demo-panel`, `theme-omp`, `ui-refinement`), поэтому `SyncedConfig` и клиентский `Config` их не ломают ([proofs/03-guides.log](proofs/03-guides.log)).
7. **Маршруты.** Пин держит поведение на маршрутах `deepseek-official` и `deepseek-account`: апстрим иначе выбрал бы там legacy Messages search (`DEEPSEEK_MODEL_ROUTES`, `DEEPSEEK_ROUTE_SEARCH_PROVIDER = 'deepseek-official'`). На `qwen-token-plan-deepseek` пин — no-op: апстрим и без него выбирает `deepseek-search-api` (`OTHER_ROUTE_SEARCH_PROVIDER`) — [proofs/03-guides.log](proofs/03-guides.log).

### Пробелы

- Патч профиля лежит вне git; ревьюится по фрагменту в этом отчёте и логам, а не диффом.
- Визуальная проверка страницы Settings с выбранным DeepSeek Search API — [04-probe-settings-websearch-dark.png](proofs/04-probe-settings-websearch-dark.png) (живая проба тикета 04, тот же профиль).

### Ревью-панель (один прогон)

Роли: reviewer-spec, reviewer-tests, reviewer-code, reviewer-kb — `qwen-token-plan/qwen3.8-flash` @ `xhigh`; модель сессии другая, фолбэков нет.

- **P2 (spec, tests, code)** — команда критерия 4 (`pnpm run test -- <пути>`) фильтр не пробрасывает и не могла дать лог «2 файла / 9 тестов»; в доказательствах не было самой команды. Исправлено: рабочая форма `node_modules/.bin/vitest run <пути>` с `LANG=C`, шапка команды и `exit=0` в логе; отклонение `pnpm run test --` названо в отчёте.
- **P2 (spec, tests, code)** — `grep` в критерии 6 был вакуозным (BRE, `|` литералом, а `['code']` — класс символов). Переписано на `grep -rEn "ForgeFailure\[['\"](code)['\"]\]|/plugins/events|EVENTS_ENDPOINT"`; второй широкий проход `failure.code|assertNever\(` тоже 0.
- **P2 (spec, kb)** — критерий 3 противоречил сам себе («критерий — exit code» при exit 1). Переформулировано: множество carrier-диагностик пином не изменилось (`/204–207`, `/233`, 5 уникальных путей / 10 строк), `invalid config:` пуст, ненулевой код — штатный сигнал `!complete`; baseline без пина приложен к доказательствам.
- **P2 (kb)** — механизм HMR назван мёртвым ключом `patchReload: live`; в дереве его никто не читает. Отчёт переписан на `dsh-hmr` из base; ключ удалён из живого профиля и копии. Апстримная Agent Note `2026-08-22-single-dsh-application-launcher.md` всё ещё описывает `patchReload` как shipped — upstream-запись решения, в юните не правилась, зацепка названа.
- **P2 (spec)** — фантомная команда `pnpm run fork-merge-ritual` в демо-пути тикета 01 исправлена на `scripts/fork-merge-ritual.sh`; фраза о базе мержа исправлена.
- **P3** — ссылка на Settings-экран теперь ведёт на снятый скриншот `04-probe-settings-websearch-dark.png`; счёт «четыре теста» уточнён до «несколько (в наблюдении четыре)»; формулировка про `headless`/`sdk` уточнена (worktree-инструмента у них нет, границу двигает SDK `setWorkingDirectory`); критерий 6 дополнен проверкой `apply(ctx)` без второго параметра (`SyncedConfig`-ветка гайда).

Открытых зацепок нет; зацепка про upstream Agent Note живёт в отчёте тикета 04.
