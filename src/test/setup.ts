// VexFlow probes canvas during font-metrics initialization at module load.
// jsdom has no canvas implementation; override silences the jsdom warnings.
// Drawing is never exercised in unit tests, so returning null is safe here.
HTMLCanvasElement.prototype.getContext = () => null;
