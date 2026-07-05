declare module "vexchords" {
  export interface ChordBoxOptions {
    width?: number;
    height?: number;
    numStrings?: number;
    numFrets?: number;
    showTuning?: boolean;
    defaultColor?: string;
    bgColor?: string;
    strokeColor?: string;
    textColor?: string;
    stringColor?: string;
    fretColor?: string;
    labelColor?: string;
    bridgeColor?: string;
    fretWidth?: number;
    stringWidth?: number;
    strokeWidth?: number;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string;
    fontStyle?: string;
    labelWeight?: string;
  }

  export interface Barre {
    fromString: number;
    toString: number;
    fret: number;
  }

  export type ChordEntry =
    | [number, number | "x"]
    | [number, number | "x", string];

  export interface ChordDef {
    chord?: ChordEntry[];
    position?: number;
    barres?: Barre[];
    tuning?: string[];
  }

  export class ChordBox {
    constructor(sel: HTMLElement | string, opts?: ChordBoxOptions);
    draw(chord: ChordDef): void;
  }

  export function draw(
    sel: string | HTMLElement,
    chord: ChordDef,
    opts?: ChordBoxOptions
  ): ChordBox;

  export const POSITIONS: Record<string, ChordDef>;
  export const SHAPES: Record<string, number[]>;
  export function build(root: string, shape: number[]): ChordDef;
}
