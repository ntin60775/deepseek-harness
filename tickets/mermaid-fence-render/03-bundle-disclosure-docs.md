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
4. **Генерации каталогов**. Артефакт: диффы `gen-client-catalog` / `gen-config-catalog` / `gen-module-graph` / `gen-dependency-catalog` + вывод их verify-гейтов. Ожидание: слой `mermaid`, модульная строка и зависимость отражены в каталогах, которыми владеют генераторы; клиентский Config `minFitScale` документирован README (сканер config-catalog читает host-entry, прецедент ui-context-menu — поправка формулировки, решение оператора 2026-11-17); гейты зелёные. На базе: дифф отсутствует/гейт красный.
5. **README и Agent Note**. Артефакт: файлы `packages/client/ui-mermaid/README.md` (секция Model Experience, Known Limitations) и Agent Note решения + вывод `pnpm run test:docs` и `pnpm run doc-sync`. Ожидание: документы на месте и гейты зелёные. На базе (дерево тикета 02): секции/записи нет → падение гейтов пакета.
6. **Финальный контур**. Артефакт: выводы `pnpm run test:gui`, `DSH_SNAPSHOT=replay pnpm run test:web`, `pnpm run hygiene`, `pnpm run doc-sync`, `build:artifacts` + `build:check`; per-file coverage тронутого src = 100% локально. Ожидание: всё зелёное на дереве тикета; известные базовые красные вне объёма называются пробелом, не чинятся молча.
7. **Замер бандла**. Артефакт: файл замера в `proofs/` (размеры стартового бандла до/после, размер ленивого чанка). Ожидание: mermaid отсутствует в стартовом бандле; новый gate не строится.

## Охранники

- Replay-голдены существующих web-сценариев без диффа; мутационные пробы компонентных спек тикетов 01–02 остаются зелёными.

## Примечания исполнения

- Push без команды оператора не делается (CI форка disabled manually); пробел PR-пути называется в отчёте тикета.
## Поправка нарезки после ship 01 (2026-11-16)

Критерии 1–2 приехали в тикет 01 pull-forward'ом вместе с lazy-чанком (лицензионное раскрытие и охранник формы чанка ships с самим чанком); на дереве 02 они уже зелёные. В 03 они верифицируют финальный набор чанков и баннер после fit-изменений; base-proof 03 несут критерии 3–5. Канал theme-попытки (часть п.6b) также доказан в 01 — см. slicing-check.md, раздел pull-forward.

## Поправка исполнения 03 (2026-11-17, решения оператора)

- Критерий 4: сканер config-catalog читает только host-entry `src/index.ts` (пустой apply без Config), клиентский `minFitScale` в каталог не попадает — прецедент ui-context-menu (`resolutionTimeoutMs`, строка «—»). Оператор выбрал поправку формулировки: каталоги отражают то, чем владеет генератор; Config документирован README. Объявление Config в host-entry ради каталога отклонено (архитектурное изменение host-лица вопреки рамке спеки «Host не меняется»).
- Базово-красные генераторы (client-catalog/plugin-packages/persistence-catalog+changes/export-jsdoc): оператор выбрал sweep внутри 03. Замер дрейфа на базе: slot-catalog +3/−2 (2 строки mermaid + сдвиг номера строки ui-sidebar), packages.md +7 (строка ui-mermaid + fork-секция web-search-zai), persistence 15+/15− (сдвиги номеров строк types.ts + i18n-хеши, SHA типов не менялись), export-jsdoc — 1 `@param options` у `SessionManager.deleteSession`.
- Критерий 3 (publish-набор) на базе зелёный: files-glob `lib/client*.js`, запись `packageFileExtras` и пины mermaid/dompurify приехали в 01 (проверено: publint/constraints/client-packages зелёные на дереве 02). Base-proof 03 несут критерии 4–5; критерий 3 в 03 верифицирует финальный publish-набор, механизм поправки тот же, что у критерия 6 тикета 02.
