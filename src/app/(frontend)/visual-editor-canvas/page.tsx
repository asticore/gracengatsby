import { CanvasFrame } from '@/views/visualEditor/CanvasFrame'

/**
 * Loaded only inside the visual editor's canvas iframe (see
 * src/views/visualEditor/canvasBridge.ts for why the canvas lives in its own
 * document). Sits under (frontend) specifically so it inherits the real
 * RootLayout - actual styles.css, fonts, theme vars, Header and Footer - the
 * same layout every real page gets. It fetches nothing of its own; the block
 * tree arrives entirely over postMessage from the parent editor window.
 */
export default function VisualEditorCanvasPage() {
  return <CanvasFrame />
}
