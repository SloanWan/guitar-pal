// Turns an exported chapter parse into the public sample book (#241):
//   src/lib/books/sample/<slug>.json  and  public/samples/<slug>/<crop>.png
//
// The export is what `book-service/materials/samples/<slug>/` holds — a
// read-only dump of the owner's own parse (parse.json + crops/ + pages/,
// the pages rendered from the PDF as JPEGs), made once because the parse
// is paid for. Run: `node scripts/build-book-sample.mjs
// sanyuetong-dense-tab sanyuetong "吉他自学三月通 — sample"`. Maintenance
// script, per CLAUDE.md /scripts. The JSON is written compact: it is loaded
// by the sample page alone, on demand, and is a few hundred KB of frets.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { basename, join } from "path";

const [exportName = "sanyuetong-dense-tab", slug = "sanyuetong", title] = process.argv.slice(2);
const exportDir = join("book-service/materials/samples", exportName);
const publicDir = join("public/samples", slug);
const outFile = join("src/lib/books/sample", `${slug}.json`);

const dump = JSON.parse(readFileSync(join(exportDir, "parse.json"), "utf8"));
mkdirSync(publicDir, { recursive: true });
mkdirSync("src/lib/books/sample", { recursive: true });

// The book, in the service's own response shape — the pages read it as a
// BookDetail. Nothing that points back at the owner's account is kept.
const book = {
	id: "sample",
	title: title || dump.book.title,
	page_count: dump.book.page_count,
	storage_path: "",
	status: "ready",
	toc_source: dump.book.toc_source,
	error: null,
	scanned_pages: dump.book.page_count,
	created_at: dump.book.created_at,
	chapters: dump.chapters.map((c) => ({
		id: c.id,
		index: c.index,
		title: c.title,
		page_start: c.page_start,
		page_end: c.page_end,
		exercise_hint_count: c.exercise_hint_count,
		parsed_at: c.parsed_at,
		parse_status: c.parse_status,
		parse_error: c.parse_error,
		parse_cost: {
			input_tokens: c.parse_input_tokens,
			output_tokens: c.parse_output_tokens,
			usd: c.parse_cost_usd,
		},
		parse_warnings: c.parse_warnings ?? [],
	})),
};

const parses = {};
for (const chapter of dump.chapters) {
	const exercises = dump.exercises
		.filter((e) => e.chapter_id === chapter.id)
		.map((e) => {
			let crop = null;
			if (e.crop_path) {
				const name = basename(e.crop_path);
				copyFileSync(join(exportDir, "crops", name), join(publicDir, name));
				crop = `/samples/${slug}/${name}`;
			}
			return {
				id: e.id,
				page: e.page,
				kind: e.kind,
				source: e.source,
				draft: e.draft,
				warnings: e.warnings ?? [],
				crop_path: crop,
				// Whatever the owner did with a draft is not the sample's story.
				status: "proposed",
			};
		});
	parses[chapter.id] = {
		chapter: book.chapters.find((c) => c.id === chapter.id),
		notes: dump.notes
			.filter((n) => n.chapter_id === chapter.id)
			.map((n) => ({ id: n.id, title: n.title, body: n.body, pages: n.pages ?? [], draft_ids: n.draft_ids ?? [] })),
		exercises,
	};
}

// The pages as printed, for the source panel (#240): whatever pages/ holds,
// keyed by page number.
const pageImages = {};
const pagesDir = join(exportDir, "pages");
if (existsSync(pagesDir)) {
	mkdirSync(join(publicDir, "pages"), { recursive: true });
	for (const name of readdirSync(pagesDir).sort()) {
		const m = /^p(\d+)\.(png|jpe?g)$/.exec(name);
		if (!m) continue;
		copyFileSync(join(pagesDir, name), join(publicDir, "pages", name));
		pageImages[Number(m[1])] = `/samples/${slug}/pages/${name}`;
	}
}

writeFileSync(outFile, JSON.stringify({ book, parses, pageImages }) + "\n");
console.log(
	`${outFile}: ${book.chapters.length} chapter(s), ${dump.notes.length} notes, ${dump.exercises.length} drafts, ${Object.keys(pageImages).length} page images; files → ${publicDir}`,
);
