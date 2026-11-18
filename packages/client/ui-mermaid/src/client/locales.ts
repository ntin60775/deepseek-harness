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
  'viewer.scroll': '图表滚动区域',
  zoomControls: '缩放控件',
  zoomMenu: '选择缩放比例',
  zoomOut: '缩小',
  zoomIn: '放大',
  zoomValue: '{percent}%',
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
  'viewer.scroll': 'Diagram scroll region',
  zoomControls: 'Zoom controls',
  zoomMenu: 'Choose zoom',
  zoomOut: 'Zoom out',
  zoomIn: 'Zoom in',
  zoomValue: '{percent}%',
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
  'viewer.scroll': '図のスクロール領域',
  zoomControls: 'ズーム操作',
  zoomMenu: 'ズームを選択',
  zoomOut: '縮小',
  zoomIn: '拡大',
  zoomValue: '{percent}%',
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
  'viewer.scroll': 'Región de desplazamiento del diagrama',
  zoomControls: 'Controles de zoom',
  zoomMenu: 'Elige zoom',
  zoomOut: 'alejar',
  zoomIn: 'Acercar',
  zoomValue: '{percent}%',
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
  'viewer.scroll': 'Zone de défilement du diagramme',
  zoomControls: 'Commandes de zoom',
  zoomMenu: 'Choisissez le zoom',
  zoomOut: 'Zoom arrière',
  zoomIn: 'Zoomer',
  zoomValue: '{percent}%',
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
  'viewer.scroll': 'Diagramm-Scrollbereich',
  zoomControls: 'Zoom-Steuerelemente',
  zoomMenu: 'Wählen Sie Zoom',
  zoomOut: 'Herauszoomen',
  zoomIn: 'Vergrößern',
  zoomValue: '{percent}%',
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
  'viewer.scroll': 'Область прокрутки диаграммы',
  zoomControls: 'Элементы управления масштабированием',
  zoomMenu: 'Выберите масштаб',
  zoomOut: 'Уменьшить масштаб',
  zoomIn: 'Увеличить масштаб',
  zoomValue: '{percent}%',
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
  'viewer.scroll': 'Região de rolagem do diagrama',
  zoomControls: 'Controles de zoom',
  zoomMenu: 'Escolha o zoom',
  zoomOut: 'Diminuir zoom',
  zoomIn: 'Ampliar',
  zoomValue: '{percent}%',
  'error.notice': 'Não foi possível renderizar o diagrama; mostrando o código-fonte.',
} satisfies Record<MermaidKey, string>
