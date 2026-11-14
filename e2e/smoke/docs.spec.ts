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

/** Four things to ask for, each with requests to copy, and the outline beside them (#515). */
test("the MCP page groups its requests by what they ask for", async ({ page }) => {
	await page.goto("/docs/mcp?lang=en");
	const ask = page.locator("section", { has: page.getByRole("heading", { name: "Try asking", level: 2 }) });
	for (const heading of ["Write a fingerpicking tab", "Write a strumming pattern", "Read a tab from a picture", "Change or rearrange it"]) {
		await expect(ask.getByRole("heading", { name: heading, level: 3 })).toBeVisible();
	}
	await expect(ask.getByRole("button", { name: "Copy the request" })).toHaveCount(12);
	await expect(page.getByRole("navigation", { name: "On this page" }).first()).toBeAttached();
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

/** The support page's questions are closed until pressed, and close again (#515). */
test("the support page's questions open and close", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/support?lang=en");
	const question = page.getByRole("article").getByText("Why is there no sound?", { exact: true });
	const answer = page.getByText("turn Silent mode off.", { exact: false });
	await expect(question).toBeVisible();
	await expect(answer).toBeHidden();
	await question.click();
	await expect(answer).toBeVisible();
	await question.click();
	await expect(answer).toBeHidden();
});

/** The docs index (#500): a card per guide, each guide linking back. */
test("the docs index opens a guide, and the guide leads back", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/docs?lang=en");
	await expect(page.getByRole("heading", { name: "Docs", level: 1 })).toBeVisible();
	const card = page.getByRole("link", { name: /Connect Guitar Pal to your AI/ });
	await hydrated(card);
	await card.click();
	await expect(page.getByRole("heading", { name: "Connect Guitar Pal to your AI", level: 1 })).toBeVisible();
	await page.getByRole("link", { name: "All docs" }).click();
	await expect(page).toHaveURL(/\/docs\?lang=en$/);
	await expect(page.getByRole("link", { name: /What the assistant reads/ })).toBeVisible();
});

/** The install guide (#525): the device's own steps first, one platform at a time. */
test("the install guide shows one device's steps at a time", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/docs/install?lang=en");
	await expect(page.getByRole("heading", { name: "Add Guitar Pal to your home screen", level: 1 })).toBeVisible();
	const devices = page.getByRole("radiogroup", { name: "Your device" });
	await hydrated(devices);
	await devices.getByRole("radio", { name: "iPhone / iPad" }).click();
	await expect(page.getByText("Open Guitar Pal in Safari.", { exact: true })).toBeVisible();
	await expect(page.getByRole("img", { name: /adding Guitar Pal from Safari's Share sheet/ })).toBeVisible();
	await devices.getByRole("radio", { name: "Android" }).click();
	await expect(page.getByText("Open Guitar Pal in Chrome.", { exact: true })).toBeVisible();
	await expect(page.getByText("Open Guitar Pal in Safari.", { exact: true })).toHaveCount(0);
	// A computer has no phone to act it out on.
	await devices.getByRole("radio", { name: "Computer" }).click();
	await expect(page.getByRole("img", { name: /Guitar Pal/ })).toHaveCount(0);
	await expect(page.getByRole("heading", { name: "Needs a connection", level: 3 })).toBeVisible();

	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
	expect(overflow).toBeLessThanOrEqual(0);
});

test("the install guide reads in Chinese", async ({ page }) => {
	await page.goto("/docs/install?lang=zh");
	await expect(page.getByRole("heading", { name: "把 Guitar Pal 添加到主屏幕", level: 1 })).toBeVisible();
	await expect(page.getByRole("radiogroup", { name: "你的设备" })).toBeVisible();
});

/** The landing's step 8 (#525): the add-to-home-screen demo, its steps pressed through, and the way to the guide. */
test("the landing shows adding to the home screen, step by step", { tag: "@phone" }, async ({ page }) => {
	await page.goto("/");
	const step = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Keep it on your home screen.", level: 2 }) });
	await step.scrollIntoViewIfNeeded();
	const phones = step.getByRole("radiogroup", { name: "Your phone" });
	await hydrated(phones);
	await phones.getByRole("radio", { name: "Android" }).click();
	const install = step.getByRole("button", { name: "Install app" });
	await install.click();
	await expect(install).toHaveAttribute("aria-current", "step");
	await expect(step.getByRole("img", { name: /installing Guitar Pal from Chrome's menu/ })).toBeVisible();

	await step.getByRole("link", { name: "How to add it" }).click();
	await expect(page.getByRole("heading", { name: "Add Guitar Pal to your home screen", level: 1 })).toBeVisible();
});
