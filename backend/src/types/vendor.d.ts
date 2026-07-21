declare module 'potrace' {
  export interface PotraceOptions {
    turnPolicy?: string;
    turdSize?: number;
    alphaMax?: number;
    optCurve?: boolean;
    optTolerance?: number;
    threshold?: number;
    blackOnWhite?: boolean;
    color?: string;
    background?: string;
    width?: number;
    height?: number;
  }
  export function trace(
    input: Buffer | string,
    options: PotraceOptions,
    cb: (err: Error | null, svg: string) => void
  ): void;
  export function posterize(
    input: Buffer | string,
    options: PotraceOptions & { steps?: number },
    cb: (err: Error | null, svg: string) => void
  ): void;
}

declare module 'imagetracerjs' {
  interface ImageDataLike {
    width: number;
    height: number;
    data: Uint8ClampedArray | Uint8Array;
  }
  interface ImageTracerStatic {
    imagedataToSVG(imgd: ImageDataLike, options?: Record<string, unknown>): string;
  }
  const ImageTracer: ImageTracerStatic;
  export default ImageTracer;
}
