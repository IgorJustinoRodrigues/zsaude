declare module 'jscanify/client' {
  export interface CornerPoint { x: number; y: number }
  export interface CornerPoints {
    topLeftCorner: CornerPoint
    topRightCorner: CornerPoint
    bottomLeftCorner: CornerPoint
    bottomRightCorner: CornerPoint
  }

  /** Mat opaco do OpenCV — não usamos diretamente no TS. */
  export type CvMat = unknown
  /** Contour opaco do OpenCV. */
  export type CvContour = unknown

  export default class Jscanify {
    /** Desenha o contorno verde do papel detectado num canvas (cópia do frame). */
    highlightPaper(canvas: HTMLCanvasElement): HTMLCanvasElement
    /** Aplica warp-perspective e devolve um canvas com o documento "achatado". */
    extractPaper(canvas: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement
    /** Retorna o contorno (Mat do OpenCV) do maior papel detectado, ou null. */
    findPaperContour(img: CvMat): CvContour | null
    /** Resolve os 4 cantos do contorno em coordenadas do canvas original. */
    getCornerPoints(contour: CvContour, img: CvMat): CornerPoints
  }
}
