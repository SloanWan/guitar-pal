// VexFlow probes canvas during font-metrics initialization at module load.
// jsdom has no canvas implementation; override silences the jsdom warnings.
// Drawing is never exercised in unit tests, so returning null is safe here.
//
// Guarded because a server-side suite runs under the node environment, where
// there is no DOM to patch and nothing that wants one.
if (typeof HTMLCanvasElement !== "undefined") {
	HTMLCanvasElement.prototype.getContext = () => null;
}
