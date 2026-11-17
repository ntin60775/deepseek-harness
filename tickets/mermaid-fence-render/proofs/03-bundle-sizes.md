# Замер бандла — тикет 03 (критерий 7)

Разовый замер размеров стартового бандла до/после юнита и ленивого чанка; новый gate не строится. «До» — дерево master до тикета 01 (пакет ui-mermaid отсутствует), «после» — дерево тикета 03. Оба дерева собраны `pnpm run build:artifacts` (8/8) под Node 24. Метод: `ls -l` (байты), `gzip -c | wc -c` (gzip), оракул отсутствия — sourcemap `sources` (фильтр `/mermaid@`, `/dompurify@`) и строковый grep `mermaid` по тексту стартовых чанков.

## Стартовый бандл (apps/web/dist)

| Артефакт | До, B | После, B | Δ, B | До gzip, B | После gzip, B |
|---|---|---|---|---|---|
| `assets/index-*.js` (entry) | 1198498 | 1198565 | +67 | 347230 | 347227 |
| `assets/vendor-*.js` | 741528 | 741528 | 0 | 179694 | 179694 |
| `assets/index-*.css` | 4185 | 4185 | 0 | — | — |
| `assets/vendor-*.css` | 27312 | 27312 | 0 | — | — |

Vendor-чанк и оба CSS после юнита байт-в-байт те же (совпадают content-hash имена). Entry вырос на 67 B сырых (gzip −3 B) — метаданные реестра строк.

## Отсутствие mermaid в стартовом бандле

- Строковый grep `mermaid`: 0 вхождений в `index-*.js` и `vendor-*.js` дерева «после».
- Sourcemap-оракул: `sources` entry и vendor содержат 0 путей `/mermaid@` и 0 `/dompurify@`.

## Ленивые чанки ui-mermaid (packages/client/ui-mermaid/lib)

| Артефакт | Байты | Gzip, B |
|---|---|---|
| `client.js` (строка плагина, грузится при включении) | 42039 | 12289 |
| `client.mermaid-entry.js` (single-chunk mermaid, грузится по первому settled fence) | 3412726 | 913435 |
| `client.js.map` | 91151 | — |
| `client.mermaid-entry.js.map` (chained) | 8012826 | — |

Emitted-набор клиентских чанков — ровно `client.js` + `client.mermaid-entry.js`; пин набора и формы — `tests/bundle-split.client.spec.ts` (1/1 на дереве тикета). Лицензионный баннер головы `client.mermaid-entry.js` покрывает mermaid, dompurify, d3, cytoscape, katex, marked, roughjs (по одному LICENSE каждого; dompurify — одна транзитивная копия через mermaid).