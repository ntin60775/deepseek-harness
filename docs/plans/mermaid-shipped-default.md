---
node_type: plan
title: Mermaid-диаграммы включены по умолчанию в web-профиле
service: _platform
status: active
updated: 2026-11-17
tags: [ui, chat, mermaid, bundle, ontoship]
links:
  part_of: [README.md]
  documents:
    - ../../packages/bundle/web-app/cordis.patch.yml
    - ../../packages/bundle/web-app/tests/mermaid-fence.spec.ts
  relates_to:
    - mermaid-fence-render.md
    - ../testing.md
---

# Mermaid-диаграммы включены по умолчанию в web-профиле

## Цель

Строка `ui-mermaid` включена в shipped-ростере web-app: ` ```mermaid `-блоки в чате рендерятся диаграммами из коробки, без opt-in деплоймента. Решение оператора 2026-11-17 («shipped-default для всех нужно»), оформлено отдельным юнитом после закрытия юнита mermaid-fence-render (тикет 03 слит 2026-11-17). Desktop-обёртка монтирует web-app-бандл и получает поведение тем же изменением.

## Готово

1. **Ростер.** Строка `ui-mermaid` в [web-app/cordis.patch.yml](../../packages/bundle/web-app/cordis.patch.yml) без `disabled: true`, комментарий строки обновлён (enabled by default, disable через profile patch). Носители: `verify-cordis-config`, `verify-client-packages`, composition-спека п.2.
2. **Composition-спека.** [mermaid-fence.spec.ts](../../packages/bundle/web-app/tests/mermaid-fence.spec.ts) пинит включённое состояние строки (имя теста и ассерт обновлены). Носители: вывод vitest; base-proof — на базовом коммите спека красная (строка ещё выключена).
3. **Классификация.** Запись `packages/client/ui-mermaid` снята из `PRODUCT_PACKAGE_POLICY` ([product-package-policy.ts:23](../../scripts/product-package-policy.ts)): enabled-строка делает пакет default-reachable ([verify-product-use.ts:168](../../scripts/verify-product-use.ts) пропускает только disabled), запись стала бы stale. Носители: `verify-product-use` зелёный; base-proof — снятая запись при выключенной строке на базе краснит гейт.
4. **Политика opt-in.** Правило «Keep opt-ins out of shipped defaults» ([testing.md](../testing.md), «Test the real entry path») дополнено клаузулой промоушена: плагин становится shipped-default решением оператора при наличии upgrade guide и REAL-composition доказательства (решение оператора 2026-11-17). Носители: `doc-sync` (md-wrap/links/budgets), вычитка прозы.
5. **Upgrade guide.** `docs/upgrade-guide/v0.2.2-rc.3/mermaid-default-on/guide.md`: диаграммы по умолчанию в web/desktop; как выключить (`- id: ui-mermaid` / `disabled: true` в profile patch); стартовая цена +12 KB gzip (client.js строки), ленивый mermaid-чанк грузится по первому settled fence. Носители: `verify-upgrade-guides`, `doc-sync`.
6. **Проза facts-in-place.** README пакета (Summary «ships disabled» → включено по умолчанию + механизм выключения), feature-нота [2026-11-16-mermaid-fence-diagram-cards](../../.agents/notes/implemented/feature/2026-11-16-mermaid-fence-diagram-cards.md) (Decision/Consequences), спека [mermaid-fence-render](mermaid-fence-render.md) п.9 и «Ограничения» (строка включена решением оператора; условие upgrade guide закрыто ссылкой на новый guide). Носители: гейты нот, `doc-sync`.
7. **Web replay и голдены.** Полный пул в CI-порядке (serial-владельцы отдельно, maxWorkers=3, exclude трёх serial). Механический критерий диффа: в diff expected допустимы только строки, связанные с включением ui-mermaid (plugin-inventory/каталог/манифест); любой иной дифф блокирует refresh и является находкой. Refresh голденов — только по критерию. Носители: proofs-лог пула, дифф refresh.
8. **Контур.** `test:gui`, `hygiene`, `doc-sync`, `build:artifacts` + `build:check`, per-file coverage тронутого src, focused ui-mermaid + composition. Базовые красные вне объёма называются пробелами, не чинятся молча. Носители: proofs-логи.

## Рамки

- Меняется только default-состояние строки web-app-ростера; base/headless/sdk/acp-бандлы не трогаются; новых extension points нет; Host, agent-loop, session-формат не меняются.
- Поведение рендера не меняется (fit/тема/sanitize/просмотрщик — юнит mermaid-fence-render); ленивый чанк и лицензионный closure-баннер тикета 03 не меняются.
- Механизм выключения сохраняется: profile-patch override `disabled: true`; README документирует оба направления.
- Один тикет; проекционная валидация waived решением оператора 2026-11-17 (механическое изменение ~8 файлов, риск сосредоточен в golden-критерии, который крыт base-proof тикета).

## Ограничения

- Upgrade guide обязателен: поведение включается shipped-профилем — условие «Ограничений» спеки mermaid-fence-render сработало.
- Refresh голденов только по механическому критерию п.7; не-whitelist дифф блокирует.
- Per-file 100% coverage тронутого src локально; полный гейт владеет CI.
- Push без команды оператора не делается.
- Точек остановки сверх план-гейта нет; базовые красные контура — названные пробелы.

## Контекст

Факты с путей (разведка 2026-11-17): строка [web-app/cordis.patch.yml:368-371](../../packages/bundle/web-app/cordis.patch.yml) `disabled: true` с комментарием «opt-in per deployment»; desktop монтирует web-app (`apps/desktop/lib/main.js`); [verify-product-use.ts:168](../../scripts/verify-product-use.ts) пропускает disabled-строки при скане достижимости; composition-спека пинит `row.disabled === true` (строки 11, 18); правило opt-in — [testing.md](../testing.md) «Test the real entry path»; директории upgrade guide существуют до `v0.2.2-rc.2`, текущая версия пакетов `0.2.2-rc.3`; `ui-mermaid` в `snapshots/web/` не упоминается (дифф включения ожидается в строках инвентаря/каталога, точный набор замеряется при исполнении); стартовая цена строки — `client.js` 42039 B / 12289 B gzip ([proofs/03-bundle-sizes.md](../../tickets/mermaid-fence-render/proofs/03-bundle-sizes.md)); бюджет open 500 ms CI ([frontend-performance-budgets](../../.agents/notes/implemented/testing/2026-09-06-frontend-performance-budgets.md)) — прирост пренебрежим.

Решения оператора 2026-11-17: shipped-default для всех; поправка правила testing.md клаузулой промоушена (вместо разового исключения); полный контур + механический golden-критерий (вместо focused); один тикет с waived проекционной валидацией (вместо полной церемонии). Спека утверждена на план-гейте 2026-11-17.

Тривиальные решения агента по фильтру раундов: версия guide `v0.2.2-rc.3` (следующий релиз, несущий изменение; директория создаётся), slug `mermaid-default-on`; снятие policy-записи форсировано гейтом verify-product-use (не развилка).