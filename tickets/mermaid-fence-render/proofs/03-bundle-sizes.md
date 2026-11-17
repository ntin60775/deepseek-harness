# Замер бандла — тикет 03 (критерий 7)

Разовый замер размеров стартового бандла до/после юнита и ленивого чанка; новый gate не строится. «До» — дерево master до тикета 01 (пакет ui-mermaid отсутствует), «после» — финальное дерево тикета 03 после лицензионного фикса баннера. Оба дерева собраны `pnpm run build:artifacts` (8/8) под Node 24. Метод: `ls -l`/`stat -c%s` (байты), `gzip -c | wc -c` (gzip), оракул отсутствия — sourcemap `sources` (фильтр `/mermaid@`, `/dompurify@`) и строковый grep `mermaid` по тексту стартовых чанков.

Условие съёма: стартовый dist собран с shipped-строкой `ui-mermaid` `disabled: true` (packages/bundle/web-app/cordis.patch.yml), поэтому в dist нет ни чанка mermaid, ни client.js пакета — отсутствие mermaid в стартовом бандле верно и для выключенного профиля. Ленивость включённого профиля доказывают bundle-split-спека (пин `require.async`) и web-сценарий с overlay `disabled: false` (apps/web/tests/mermaid-fence.overlay.yml), не этот замер.

## Стартовый бандл (apps/web/dist)

| Артефакт | До, B | После, B | Δ, B | До gzip, B | После gzip, B |
|---|---|---|---|---|---|
| `assets/index-*.js` (entry) | 1198498 | 1198565 | +67 | 347230 | 347227 |
| `assets/vendor-*.js` | 741528 | 741528 | 0 | 179694 | 179694 |
| `assets/index-*.css` | 4185 | 4185 | 0 | — | — |
| `assets/vendor-*.css` | 27312 | 27312 | 0 | — | — |

Vendor-чанк и оба CSS после юнита байт-в-байт те же (совпадают content-hash имена: `vendor-BUMdD3V7.js`, `index-B_7bmv2h.css`, `vendor-DV2921Zo.css`). Entry вырос на 67 B сырых (gzip −3 B) — метаданные реестра строк.

Листинг «до» (detached-worktree дерева pre-01, `apps/web/dist/assets`, `ls -l`):

```text
4185    index-B_7bmv2h.css
1198498 index-BWoGLECt.js
741528  vendor-BUMdD3V7.js
27312   vendor-DV2921Zo.css
gzip index-BWoGLECt.js: 347230
gzip vendor-BUMdD3V7.js: 179694
```

## Отсутствие mermaid в стартовом бандле

- Строковый grep `mermaid`: 0 вхождений в `index-San2XO3t.js` и `vendor-BUMdD3V7.js` финального дерева.
- Sourcemap-оракул: `sources` entry и vendor содержат 0 путей `/mermaid@` и 0 `/dompurify@`.

## Ленивые чанки ui-mermaid (packages/client/ui-mermaid/lib)

| Артефакт | Байты | Gzip, B |
|---|---|---|
| `client.js` (строка плагина, грузится при включении) | 42039 | 12289 |
| `client.mermaid-entry.js` (single-chunk mermaid, грузится по первому settled fence) | 3489290 | 917921 |
| `client.js.map` | 91151 | — |
| `client.mermaid-entry.js.map` (chained) | 8014334 | — |

Emitted-набор клиентских чанков — ровно `client.js` + `client.mermaid-entry.js` (листинг `lib/`: оба чанка, оба map, host `index.js`, `types/`). Bundle-split-спека пинит список `require.async`-целей entry, отсутствие синхронных относительных require и self-containedness чанка; точный набор из двух чанков доказан листингом выше, не спекой.

Лицензионный баннер головы `client.mermaid-entry.js` кредитит установленный dependency-closure mermaid — все 56 пакетных корней чанка (оракул — sourcemap `sources`), включая отдельные d3-пакеты, lodash-es, dagre-d3-es, @mermaid-js/parser, es-toolkit, khroma, dayjs, uuid, stylis, ts-dedent, cose-base/layout-base/cytoscape-fcose/cytoscape-cose-bilkent, @braintree/sanitize-url, @upsetjs/venn.js, @iconify/utils, fastdom; dompurify — одна транзитивная копия. Охранник покрытия — второй тест `tests/bundle-split.client.spec.ts` (баннер ⊇ корни чанка); мутация «выкинуть khroma» краснит его ровно на ['khroma'] (03-mutations.log, M6). Прирост чанка от лицензионного фикса: +76564 B сырых (+4486 gzip) против баннера 7 корней.