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