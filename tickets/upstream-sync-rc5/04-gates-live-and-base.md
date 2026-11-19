# Тикет 04 — Гейты, живая проба, база

Блокеры: 03 (профиль запинен до пробы и записи базы).
Спека: [docs/plans/upstream-sync-rc5.md](../../docs/plans/upstream-sync-rc5.md), пункты «Готово» 5–8.
Гейт проекций: [projections.md](projections.md) (находки 9–20, 29–34).

## Демо-путь

Лайт-контур зелёный, второй экземпляр интерфейса на `:3081` открывается с копией профиля: композер держит виджет темы, страница Plugins и Settings работают, страница ревью forge показывает список change request, обе схемы на месте; `packages/fork/upstream-base.json` несёт `dsh-v0.2.2-rc.5`, доки форка и состояние проекта обновлены.

## Критерии приёмки (падают на базовом коммите)

1. **Контур.** Артефакт: вывод `pnpm run build`, `pnpm run typecheck`, `pnpm run constraints`, `pnpm run test:docs`, `pnpm run doc-sync`. Ожидание: все зелёные; `doc-sync` включает каталоги, которых нет в doc-quick. На базе: инвариант; краснеет на регенерации после мержа.
2. **Снапшоты.** Артефакт: `node -v` и `pnpm run test:snapshot`. Ожидание: Node 24 в выводе, все сценарии прошли или пропущены по своим причинам, падений нет. На базе: под Node 22 падают PTC-сценарии.
3. **Focused.** Артефакт: прогоны по списку спеки — `ui-chat`, `ui-conversation`, `ui-sidebar`, `ui-subagent`, `ui-mermaid`, `ui-theme`, `ui-sidebar-documentpreview`, `ui-deliverables`, `ui-account-notifications`, `connection`, `ui-settings-models`, `shortcuts`, `extensions/cordis-client-runner`, `fork/web-search-zai`, `bundle/base`, `mcp-client`, `session-persistence-sqlite`, `sandbox-policy`, `worktree`. Ожидание: зелёные; `pnpm run fork:invariants` зелёный. На базе: инвариант; краснеют при регрессии форк-поверхностей.
4. **Классификатор темы.** Артефакт: `node ~/home/dev/dsh-plugins/theme-omp/verify/classify.mjs --checkout $PWD --strict`. Ожидание: exit code 0; каждый `NEW` имеет решение в отчёте. На базе: инвариант.
5. **Живая проба.** Артефакт: лог старта, HTTP-код, скриншоты, `cordis_inspect_query`. Ожидание: `DSH_HOME=/home/prog7/.dsh-probe` той же глубины с `node_modules`; HTTP 200 на `:3081`; в логе нет `skipping profile bundle` и `patch: ... not found`; слот `conversation.composer.dock` занят виджетом темы; экраны шапки, композера, Plugins, Settings, `omp-demo-panel` и страницы ревью forge прочитаны в обеих схемах. На базе: второго инстанса нет.
6. **База.** Артефакт: `packages/fork/upstream-base.json`. Ожидание: `{tag: "dsh-v0.2.2-rc.5", mergedAt: "2026-11-19"}` или дата фактического прогона; sha нет. На базе: записан `dsh-v0.2.2-rc.4`.
7. **Доки и KB.** Артефакт: дифф [docs/ops/fork-upgrade.md](../../docs/ops/fork-upgrade.md), [docs/reference/fork-merge-ritual.md](../../docs/reference/fork-merge-ritual.md), [packages/fork/README.md](../../packages/fork/README.md), [.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md](../../.agents/notes/implemented/process/2026-09-08-fork-merge-ritual.md), [docs/ops/continue.md](../../docs/ops/continue.md) + `gitmark index`, `gitmark lint --strict`, `gitmark map -o docs-map.html`. Ожидание: диапазон от merge-base, новый генерируемый конфликт и флаг лайт-контура описаны; lint без `ERR`. На базе: доки описывают прежний диапазон.

## Охранники

- `:3080` не рестартится и не гасится; правка профиля доезжает HMR-ом.
- Копия `DSH_HOME` не несёт сессий, баз и credentials основного дома.
- Полный `test:gui`, replay `test:web` и unit-лэйн целиком не гоняются — пробел назван в отчёте, а не выдан за прогон.
- Push не делается.

## Примечания исполнения

- Копия профиля: `package.json`, `cordis.yml`, `cordis.patch.yml`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `node_modules`; относительные симлинки `link:` ломаются при другой глубине `DSH_HOME`.
- Сообщение `failed to load` клиентское и критерием старта не является; критерий — exit code и отсутствие двух строк про bundle и patch.
- Отчёт доказательств — в этот файл; скриншоты — `tickets/upstream-sync-rc5/proofs/`.