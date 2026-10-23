/**
 * Wrapping a run of items onto as few rows as fit, with the rows as close to the
 * same length as they can be: 4 beats that do not fit on one line go 2 + 2, not
 * 3 + 1; 5 chords go 3 + 2. A line that has to break should still read as one
 * shape.
 */

/** Row lengths, as even as possible, for `count` items over `rows` rows: longest first. */
export function evenRowSizes(count: number, rows: number): number[] {
	const r = Math.max(1, Math.min(count, rows));
	const base = Math.floor(count / r);
	const extra = count % r;
	return Array.from({ length: r }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * The row lengths for items of these widths in `available` px, `gap` between
 * neighbours: the fewest rows whose even split fits. An item wider than the
 * space on its own still gets a row of its own rather than nothing.
 */
export function balancedRowSizes(widths: readonly number[], available: number, gap: number): number[] {
	const n = widths.length;
	if (n === 0) return [];
	for (let rows = 1; rows <= n; rows++) {
		const sizes = evenRowSizes(n, rows);
		let start = 0;
		const fits = sizes.every((size) => {
			const row = widths.slice(start, start + size);
			start += size;
			return row.reduce((sum, w) => sum + w, 0) + gap * (row.length - 1) <= available;
		});
		if (fits) return sizes;
	}
	return widths.map(() => 1);
}

/** For items of one width: how many go on each row (the longest row's length). */
export function balancedPerRow(count: number, available: number, itemWidth: number, gap: number, max = Infinity): number {
	if (count === 0) return 1;
	const fit = Math.max(1, Math.min(max, Math.floor((available + gap) / (itemWidth + gap))));
	const rows = Math.ceil(count / fit);
	return Math.ceil(count / rows);
}

/** Split items into consecutive rows of the given sizes. */
export function splitRows<T>(items: readonly T[], sizes: readonly number[]): T[][] {
	const rows: T[][] = [];
	let start = 0;
	for (const size of sizes) {
		rows.push(items.slice(start, start + size));
		start += size;
	}
	return rows;
}
