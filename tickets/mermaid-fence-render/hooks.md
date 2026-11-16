# Зацепки юнита mermaid-fence-render

Реестр P3-находок ревью-панелей и остаточных пробелов; автоприёмку не блокируют.

## Тикет 01 (ревью-панель 2026-11-16)

- P3 (reviewer-kb): projections.md ORD-3 сохраняет историческую формулировку «7 locale JSON» как запись прошедшего гейта; спека и тикет унифицированы на 8 shipped-языков.

- P3 (reviewer-tests): `bundle-split.client.spec.ts` — носитель пункта 10 спеки (тикет 03 по slicing-check), приехал в коммите 01 как инвариантный охранник lazy-чанка, введённого этим тикетом (прецедент skipIf — ui-sidebar-terminal). Оставлен охранником; вопрос скоупа — к reviewer-spec / оператору при приёмке тикета 03.
- P3 (reviewer-tests, исправлено в проходе): оракул width/height в svg-спеке переведён на независимые литералы; aria-label сохранности покрыт синтетическим корнем; click-векторы переименованы в inert-pipeline плюс синтетический сырой вектор с javascript:/onclick/use; unmount-тест ассертит cancel.
- Базовые красные контура (подтверждены на базовом master среза 2026-11-16): ui-settings-account (account + formatBalance), ui-deliverables review-tab (flake), ui-theme elevation-styles (SidebarRoot.module.css), verify-no-unknown-casts (ui-conversation todo-panel:138), verify-locale-metadata + verify-cordis-config (packages/fork/web-search-zai), verify-optional-dependency-imports (api/session-controller commands.ts:24). Условие возврата — следующий sweep окна PR.
- P3 (reviewer-code): `COPIED_WINDOW_MS = 1000` в ui-mermaid дублирует inline-окно CodeBlock (ui-primitives). Вынос общей константы запрещён рамкой спеки «ui-primitives не меняется» — оставить паритет с комментарием; возврат при следующем изменении ui-primitives.
- P3 (reviewer-code, исправлено в проходе): viewBox читается с корня (не regex по документу); catch-ветки контроллера именуют ошибку через console.debug (диагностика оператора, не user copy и не session-событие); дубль paths-пары ui-mermaid в tsconfig.base.json снят (P2).
- Базовые красные doc-sync (подтверждены на базовом master среза 2026-11-16, stale после rc3-мержа): verify-export-jsdoc (SessionManager.deleteSession @param), gen-persistence-catalog/verify-persistence-changes, gen-plugin-packages, gen-client-catalog (slot-catalog). Генерации client-catalog/plugin-packages/persistence остаются за тикетом 03 / sweep; в 01 перегенерированы только config-catalog и module-graph (краснели от строки пакета при зелёной базе).
- Базовый красный hmr-live.e2e.ts (таймаут getByText fixture-текста, воспроизведён на базовом master среза 2026-11-16): CI-лейн test:web:ci останавливается на serial-стадии; обход для контура — serial-владельцы отдельно + параллельный пул с --exclude трёх serial-файлов. Условие возврата — sweep окна PR.
- Полный список базовых красных web-сценариев (30 файлов, сверено прогоном на базовом коммите) и doc-sync генераторов — в «Что осталось» docs/ops/continue.md (очередь sweep окна PR); здесь не дублируется.
