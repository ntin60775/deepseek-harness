# Тикет 01 — Включить ui-mermaid по умолчанию

Блокеры: нет (юнит mermaid-fence-render закрыт, тикет 03 слит 2026-11-17).
Спека: [docs/plans/mermaid-shipped-default.md](../../docs/plans/mermaid-shipped-default.md), пункты «Готово» 1–8.
Гейт проекций: [projections.md](projections.md) (waived решением оператора 2026-11-17).

## Демо-путь

Свежий web-профиль без opt-in патчей: ` ```mermaid `-блок в чате рендерится диаграммой из коробки (тема, вписывание/натуральный скролл, исходник/копия/просмотрщик). Выключение через profile patch (`- id: ui-mermaid` / `disabled: true`) возвращает код-блок. Upgrade guide опубликован и описывает оба направления.

## Критерии приёмки (падают на базовом коммите тикета)

1. **Ростер и composition-спека.** Артефакт: строка `ui-mermaid` в `packages/bundle/web-app/cordis.patch.yml` + вывод vitest `packages/bundle/web-app/tests/mermaid-fence.spec.ts`. Ожидание: строка без `disabled: true`, комментарий обновлён; спека пинит включённое состояние (имя теста и ассерт обновлены). На базе: спека после флипа красная (строка ещё выключена) — base-proof несёт флип ассерта.
2. **Классификация.** Артефакт: дифф `scripts/product-package-policy.ts` + вывод `verify-product-use`. Ожидание: запись `packages/client/ui-mermaid` снята (enabled-строка = default-reachable), гейт зелёный. На базе: снятая запись при выключенной строке краснит гейт (пакет недостижим и не классифицирован).
3. **Политика и upgrade guide.** Артефакт: клаузула промоушена в `docs/testing.md` («Test the real entry path») + файл `docs/upgrade-guide/v0.2.2-rc.3/mermaid-default-on/guide.md` + вывод `verify-upgrade-guides` и `doc-sync`. Ожидание: правило допускает shipped-default решением оператора при upgrade guide и REAL-composition доказательстве; guide описывает изменение, выключение, стартовую цену (+12 KB gzip) и ленивый чанк. На базе: guide отсутствует (base-proof — отсутствие файла, не красный гейт; механизм тот же, что у критерия 5 тикета 03 юнита mermaid-fence-render).
4. **Проза facts-in-place.** Артефакт: диффы README `packages/client/ui-mermaid`, feature-ноты `2026-11-16-mermaid-fence-diagram-cards`, спеки `mermaid-fence-render` (п.9 и «Ограничения») + вывод гейтов нот и `doc-sync`. Ожидание: «ships disabled» заменено на включённое состояние с механизмом выключения; условие upgrade guide в спеке юнита закрыто ссылкой на новый guide. На базе: проза утверждает выключенное состояние (расхождение факт/текст, не красный гейт — называется честно).
5. **Web replay и голдены.** Артефакт: proofs-лог пула в CI-порядке (serial-владельцы отдельно, maxWorkers=3, exclude трёх serial) + дифф refresh. Ожидание: механический критерий — в diff expected только строки включения ui-mermaid (plugin-inventory/каталог/манифест); любой иной дифф блокирует refresh и является находкой; mermaid-fence сценарий зелёный, голдены остальных сценариев без не-whitelist диффа. На базе: критерий верификационный (base-proof несут критерии 1–2).
6. **Контур.** Артефакт: выводы `test:gui`, `hygiene`, `doc-sync`, `build:artifacts` + `build:check`, per-file coverage тронутого src, focused ui-mermaid + composition. Ожидание: всё зелёное на дереве тикета; известные базовые красные вне объёма называются пробелом, не чинятся молча.

## Охранники

- Поведение рендера не меняется: focused ui-mermaid 80/80 и bundle-split 2/2 зелёные, мутационные пробы M1–M6 юнита mermaid-fence-render остаются краснеющими; лицензионный closure-баннер не меняется.
- Механизм выключения работает: profile-patch override `disabled: true` возвращает код-блок (живая проба или web-сценарий с overlay).

## Примечания исполнения

- Один тикет на юнит; проекционная валидация waived оператором (запись в projections.md).
- Push без команды оператора не делается; пробел PR-пути называется в отчёте.
- Отчёт доказательств — в этот файл по форме отчётов юнита mermaid-fence-render; proofs — `tickets/mermaid-shipped-default/proofs/`.