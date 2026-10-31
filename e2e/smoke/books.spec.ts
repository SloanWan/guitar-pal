import { expect, test } from "../fixtures";

/**
 * Books, signed out (#404): the sample is open to everyone, so it is the one
 * path through the shelf, a chapter, a draft beside the book and the page it
 * was read from — and back from the page to the draft.
 */
test("the sample opens a chapter, a draft beside it, and the draft's page", async ({ page }) => {
	await page.goto("/books");
	await expect(page.getByRole("heading", { name: "Books", exact: true, level: 1 })).toBeVisible();
	await page.getByRole("link", { name: /吉他自学三月通/ }).click();

	await expect(page).toHaveURL(/\/books\/sample$/);
	await page.getByRole("button", { name: /第三篇/ }).click();
	const drafts = page.getByRole("list", { name: "Practice drafts" });
	await expect(drafts.getByRole("listitem")).toHaveCount(16);

	await drafts.getByRole("button", { name: /^Open / }).first().click();
	const panel = page.getByRole("complementary", { name: "Practice draft" });
	await expect(panel).toBeVisible();
	await expect(panel.getByRole("button", { name: "Open in Tab" })).toBeVisible();

	await panel.getByRole("button", { name: /^p\.\d+$/ }).click();
	const source = page.getByRole("complementary", { name: "Source page" });
	await expect(source.getByRole("img", { name: /^Page \d+ of / })).toBeVisible();

	await source.getByRole("button", { name: "Back to the draft" }).click();
	await expect(page.getByRole("complementary", { name: "Practice draft" })).toBeVisible();
});
