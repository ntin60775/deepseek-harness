# Зацепки юнита mermaid-viewer-scale-zoom

Реестр открытых зацепок и базовых красных; автоприёмку не блокируют (P3/базовые).

- P3 (тикеты 01–02): `HoverCard.tsx` dismiss по Escape — bubble на window без проверки `defaultPrevented`; после выравнивания lightbox на общий modal-контракт один Escape закрывает и lightbox, и hover-preview. Правка — проверка флага в dismiss; условие возврата — sweep окна PR или тикет 02 (viewer наследует контракт).
- P3 (стек): экспорт `LightboxShell` без внешнего консьюмера до тикета 02 (mermaid viewer) — порядок тикетов, не отдельный PR.
- Лайт-контур: мутация M4 (padding из shell) не прогнана (jsdom не наблюдает CSS); охранник геометрии — зелёные e2e-пины markdown-images; условие возврата — полный контур окна PR.
- Базовые красные (воспроизведены на master 2026-11-18, к юниту отношения не имеют): context-menus ×2 теста («Delete session» vs «Archive session», Rename timeout — дрейф rc.4), ui-settings-account ×2, ui-theme elevation-styles ×1, ui-tool details-row ×2; список и условия возврата — continue.md и hooks.md юнита mermaid-fence-render.

Открытых ишью нет.