/**
 * Where to send a user after they sign in.
 *
 * The target comes off the query string (`/auth?redirect=…`), so anyone can
 * craft it. Only a same-origin path is honoured: it must start with a single
 * `/`. A second `/` (or a `\`, which browsers fold into `/`) would make it a
 * protocol-relative URL and send a freshly signed-in user off-site.
 */
export const DEFAULT_REDIRECT = "/home";

export function safeRedirectPath(
	raw: string | null | undefined,
	fallback: string = DEFAULT_REDIRECT,
): string {
	if (!raw || raw[0] !== "/") return fallback;
	if (raw[1] === "/" || raw[1] === "\\") return fallback;
	return raw;
}

/**
 * The sign-in link for a visitor currently at `pathname` + `search`: carries
 * the page as `redirect` so they land back on it after signing in. `/` is
 * passed through as-is — the proxy sends a signed-in user on to `/home`.
 */
export function signInHref(pathname: string, search: string = ""): string {
	return `/auth?redirect=${encodeURIComponent(pathname + search)}`;
}
