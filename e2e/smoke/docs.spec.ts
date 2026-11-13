import { expect, hydrated, test } from "../fixtures";

/** The MCP connect page (#486): only the chosen client's card is on the page. */
test("the MCP page shows the URL and one client's setup at a time", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/docs/mcp?lang=en");
	await expect(page.getByRole("heading", { name: "Connect Guitar Pal to your AI", level: 1 })).toBeVisible();
	await expect(page.getByText("https://guitarpal.sloanwan.com/api/mcp", { exact: true }).first()).toBeVisible();

	const clients = page.getByRole("radiogroup", { name: "Your app" });
	await hydrated(clients);
	await expect(clients.getByRole("radio", { name: "Claude", exact: true })).toBeChecked();
	await expect(page.getByRole("button", { name: "Copy the command" })).toHaveCount(0);

	await clients.getByRole("radio", { name: "ChatGPT" }).click();
	await expect(page.getByText("chatgpt.com/plugins", { exact: true })).toBeVisible();

	await clients.getByRole("radio", { name: "Claude Code" }).click();
	await expect(page.getByRole("button", { name: "Copy the command" })).toBeVisible();
	await expect(page.getByText("claude mcp add --transport http guitar-pal", { exact: false })).toBeVisible();

	await clients.getByRole("radio", { name: "Cursor" }).click();
	await expect(page.getByRole("button", { name: "Copy the config" })).toBeVisible();
	await expect(page.getByRole("button", { name: "Copy the command" })).toHaveCount(0);

	// Five clients outgrow a phone: the picker scrolls, never the page.
	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test("the MCP page reads in Chinese", async ({ page }) => {
	await page.goto("/docs/mcp?lang=zh");
	await expect(page.getByRole("heading", { name: "把 Guitar Pal 接入你的 AI", level: 1 })).toBeVisible();
	await expect(page.getByRole("radiogroup", { name: "你的应用" })).toBeVisible();
});

/** The pages the MCP directories link to (#492), reached from the landing footer. */
test("the landing footer reaches privacy, terms and support, in both languages", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/");
	const legal = page.getByRole("navigation", { name: "Legal" });
	await legal.getByRole("link", { name: "Privacy" }).click();
	await expect(page.getByRole("heading", { name: "Privacy policy", level: 1 })).toBeVisible();

	await page.goto("/terms?lang=zh");
	await expect(page.getByRole("heading", { name: "使用条款", level: 1 })).toBeVisible();

	await page.goto("/support?lang=en");
	await expect(page.getByRole("heading", { name: "Support", level: 1 })).toBeVisible();
	await expect(page.getByRole("link", { name: "nysuswan@gmail.com" }).first()).toHaveAttribute("href", "mailto:nysuswan@gmail.com");
});

/** The title and the language switch share the first row (#515), and the switch is a link to the other language. */
test("a document's title and language switch share a row, and the switch changes the language", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/privacy?lang=en");
	const title = page.getByRole("heading", { name: "Privacy policy", level: 1 });
	const toggle = page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: /Switch to 中文/ });
	await expect(title).toBeVisible();
	const [t, s] = [await title.boundingBox(), await toggle.boundingBox()];
	expect(t && s).toBeTruthy();
	// Level with the title's first line, beside it rather than above or below.
	expect(s!.y).toBeLessThan(t!.y + 40);
	expect(s!.y + s!.height).toBeGreaterThan(t!.y);
	expect(s!.x).toBeGreaterThan(t!.x);

	await hydrated(toggle);
	await toggle.click();
	await expect(page).toHaveURL(/lang=zh/);
	await expect(page.getByRole("heading", { name: "隐私政策", level: 1 })).toBeVisible();
	await expect(page.getByRole("navigation", { name: "Language" }).getByRole("link", { name: /Switch to English/ })).toBeVisible();

	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});
