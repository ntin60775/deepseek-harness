# Тикет 03 — Бандл, раскрытие, документы

Блокеры: тикеты 01, 02.
Спека: [docs/plans/mermaid-fence-render.md](../../docs/plans/mermaid-fence-render.md), пункты «Готово» 10, 11, 12.
Гейт проекций: [projections.md](projections.md).

## Демо-путь

Инспекция собранных артефактов: mermaid живёт в одном ленивом self-contained чанке `lib/client.<name>.js` с лицензионным баннером, покрывающим всё bundled-стороннее дерево; `THIRD_PARTY_NOTICES.md` и генерируемые каталоги обновлены; README пакета с Model Experience и Agent Note решения на месте; полный контур проверок зелёный. Замер размеров стартового бандла до/после записан в `proofs/`.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Пакетная bundle-split спека** (прецедент `ui-sidebar-terminal/tests/bundle-split.client.spec.ts`). Артефакт: вывод vitest + листинг `lib/`. Ожидание: вход держит ровно `require.async("./client.<name>.js")`; фактический набор emitted-чанков запинен; все `lib/client*.js` self-contained (нет синхронных относительных require); форма бандлинга mermaid-входа — single-chunk / inline dynamic imports. На базе (дерево тикета 02): спеки/чанка нет → падение.
2. **Лицензионный баннер и notices**. Артефакт: голова emitted-чанка + дифф `THIRD_PARTY_NOTICES.md` + вывод `gen/verify-third-party-notices`. Ожидание: `clientBanner` по имени чанка покрывает приватные копии дерева mermaid (d3/cytoscape/katex/marked/roughjs; dompurify — одна транзитивная копия); mermaid переходит из dev-only в distributed tier реестра. На базе: баннера/строки нет → падение.
3. **Publish-набор**. Артефакт: вывод `pnpm run hygiene` (publint + constraints). Ожидание: `files` glob `lib/client*.js` + запись `packageFileExtras` покрывают каждый эмитуемый чанк; пины `mermaid` ровно 11.17.2 и `dompurify ^3.4.16` в devDependencies. На базе: падение/расхождение.
4. **Генерации каталогов**. Артефакт: диффы `gen-client-catalog` / `gen-config-catalog` / `gen-module-graph` / `gen-dependency-catalog` + вывод их verify-гейтов. Ожидание: слой `mermaid`, Config `minFitScale`, модульная строка и зависимость отражены в каталогах; гейты зелёные. На базе: дифф отсутствует/гейт красный.
5. **README и Agent Note**. Артефакт: файлы `packages/client/ui-mermaid/README.md` (секция Model Experience, Known Limitations) и Agent Note решения + вывод `pnpm run test:docs` и `pnpm run doc-sync`. Ожидание: документы на месте и гейты зелёные. На базе (дерево тикета 02): секции/записи нет → падение гейтов пакета.
6. **Финальный контур**. Артефакт: выводы `pnpm run test:gui`, `DSH_SNAPSHOT=replay pnpm run test:web`, `pnpm run hygiene`, `pnpm run doc-sync`, `build:artifacts` + `build:check`; per-file coverage тронутого src = 100% локально. Ожидание: всё зелёное на дереве тикета; известные базовые красные вне объёма называются пробелом, не чинятся молча.
7. **Замер бандла**. Артефакт: файл замера в `proofs/` (размеры стартового бандла до/после, размер ленивого чанка). Ожидание: mermaid отсутствует в стартовом бандле; новый gate не строится.

## Охранники

- Replay-голдены существующих web-сценариев без диффа; мутационные пробы компонентных спек тикетов 01–02 остаются зелёными.

## Примечания исполнения

- Push без команды оператора не делается (CI форка disabled manually); пробел PR-пути называется в отчёте тикета.