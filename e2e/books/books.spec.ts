import { CREDENTIALS, expect, signIn, test } from "../fixtures";

/**
 * Textbook import, end to end: browser → the Next.js proxy → the Python
 * service → Supabase and back. Local and by hand only — it needs
 * `npm run dev` and `npm run dev:books` both up, a PDF on disk, and minutes
 * of OCR. Never on CI.
 *
 *     E2E_BOOK_PDF=book-service/materials/<some>.pdf npm run test:e2e:books
 *
 * The parse step calls the model, so it costs money and is opt-in again with
 * `E2E_BOOKS_PARSE=1`. The book is deleted at the end either way.
 */
const PDF = process.env.E2E_BOOK_PDF;
const WITH_PARSE = Boolean(process.env.E2E_BOOKS_PARSE);
const TITLE = `e2e ${new Date().toISOString()}`;

// A scan is OCR at roughly 2.5 s a page, plus the upload.
const SCAN_TIMEOUT = 20 * 60_000;
const PARSE_TIMEOUT = 10 * 60_000;

test.describe("book import", () => {
	test.skip(!PDF, "set E2E_BOOK_PDF to a PDF on disk");
	test.skip(!CREDENTIALS.email || !CREDENTIALS.password, "set E2E_EMAIL and E2E_PASSWORD to run");
	test.describe.configure({ mode: "serial", timeout: SCAN_TIMEOUT + PARSE_TIMEOUT });

	test("uploads, scans, parses and deletes a book", async ({ page }) => {
		await page.goto("/auth?redirect=%2Fbooks");
		await signIn(page);
		await expect(page).toHaveURL(/\/books$/);

		// The proxy answers 503 when BOOK_SERVICE_URL is unset; say so rather
		// than failing later on a missing control.
		const upload = page.getByRole("button", { name: "Upload a PDF" });
		await expect(upload, "is `npm run dev:books` running, with BOOK_SERVICE_URL set?").toBeVisible();

		await page.locator('input[type="file"]').setInputFiles(PDF!);

		const book = page.getByRole("link", { name: new RegExp(TITLE) }).or(page.getByText(/Scanning/i));
		await expect(book.first()).toBeVisible({ timeout: 120_000 });

		// The scan is a background job the page polls; chapters are what it
		// leaves behind, and there is always at least one (a `manual` chapter
		// spanning the book when nothing was found). A chapter's row opens its card.
		const chapters = page.locator("button[aria-expanded]");
		await expect(chapters.first()).toBeVisible({ timeout: SCAN_TIMEOUT });
		await chapters.first().click();
		const parse = page.getByRole("button", { name: /Parse this chapter/ });
		await expect(parse).toBeVisible();

		if (WITH_PARSE) {
			await parse.click();
			await expect(page.getByText(/^Parsed /)).toBeVisible({ timeout: PARSE_TIMEOUT });
		}

		await page.getByRole("button", { name: "Book actions" }).click();
		await page.getByRole("menuitem", { name: /Delete book/ }).click();
		await page.getByRole("button", { name: "Delete book" }).click();
		await expect(page).toHaveURL(/\/books$/, { timeout: 60_000 });
	});
});
