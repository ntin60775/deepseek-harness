/** `mermaid` namespace dictionaries for the diagram fence card. */

/** Simplified Chinese dictionary and key-set source of truth. */
export const zh = {
  'diagram.label': 'Mermaid 图表',
  'source.toggle': '源码',
  copy: '复制',
  copied: '已复制',
  'viewer.open': '在查看器中打开图表',
  'viewer.dialog': '图表查看器',
  'viewer.close': '关闭',
  'error.notice': '图表渲染失败，显示源码。',
} satisfies Record<string, string>

/** Mermaid fence card key union. */
export type MermaidKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'diagram.label': 'Mermaid diagram',
  'source.toggle': 'Source',
  copy: 'Copy',
  copied: 'Copied',
  'viewer.open': 'Open diagram in viewer',
  'viewer.dialog': 'Diagram viewer',
  'viewer.close': 'Close',
  'error.notice': 'The diagram could not be rendered; showing the source.',
} satisfies Record<MermaidKey, string>

/** Japanese copy, checked against the English keys. */
export const ja = {
  'diagram.label': 'Mermaid 図',
  'source.toggle': 'ソース',
  copy: 'コピー',
  copied: 'コピーしました',
  'viewer.open': '図をビューアーで開く',
  'viewer.dialog': '図ビューアー',
  'viewer.close': '閉じる',
  'error.notice': '図をレンダリングできませんでした。ソースを表示します。',
} satisfies Record<MermaidKey, string>

/** Spanish copy, checked against the English keys. */
export const es = {
  'diagram.label': 'Diagrama Mermaid',
  'source.toggle': 'Fuente',
  copy: 'Copiar',
  copied: 'Copiado',
  'viewer.open': 'Abrir el diagrama en el visor',
  'viewer.dialog': 'Visor de diagramas',
  'viewer.close': 'Cerrar',
  'error.notice': 'No se pudo representar el diagrama; se muestra el código fuente.',
} satisfies Record<MermaidKey, string>

/** French copy, checked against the English keys. */
export const fr = {
  'diagram.label': 'Diagramme Mermaid',
  'source.toggle': 'Source',
  copy: 'Copier',
  copied: 'Copié',
  'viewer.open': 'Ouvrir le diagramme dans la visionneuse',
  'viewer.dialog': 'Visionneuse de diagrammes',
  'viewer.close': 'Fermer',
  'error.notice': 'Le diagramme n’a pas pu être rendu ; la source est affichée.',
} satisfies Record<MermaidKey, string>

/** German copy, checked against the English keys. */
export const de = {
  'diagram.label': 'Mermaid-Diagramm',
  'source.toggle': 'Quelltext',
  copy: 'Kopieren',
  copied: 'Kopiert',
  'viewer.open': 'Diagramm im Betrachter öffnen',
  'viewer.dialog': 'Diagrammbetrachter',
  'viewer.close': 'Schließen',
  'error.notice': 'Das Diagramm konnte nicht gerendert werden; der Quelltext wird angezeigt.',
} satisfies Record<MermaidKey, string>

/** Russian copy, checked against the English keys. */
export const ru = {
  'diagram.label': 'Диаграмма Mermaid',
  'source.toggle': 'Исходник',
  copy: 'Копировать',
  copied: 'Скопировано',
  'viewer.open': 'Открыть диаграмму в просмотрщике',
  'viewer.dialog': 'Просмотр диаграммы',
  'viewer.close': 'Закрыть',
  'error.notice': 'Не удалось отрисовать диаграмму; показан исходник.',
} satisfies Record<MermaidKey, string>

/** Portuguese copy, checked against the English keys. */
export const pt = {
  'diagram.label': 'Diagrama Mermaid',
  'source.toggle': 'Fonte',
  copy: 'Copiar',
  copied: 'Copiado',
  'viewer.open': 'Abrir o diagrama no visualizador',
  'viewer.dialog': 'Visualizador de diagramas',
  'viewer.close': 'Fechar',
  'error.notice': 'Não foi possível renderizar o diagrama; mostrando o código-fonte.',
} satisfies Record<MermaidKey, string>
