package com.guitarpal.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the Supabase project lives, for checking its session tokens.
 *
 * @param url       the project URL, e.g. {@code https://abc.supabase.co}
 * @param jwtSecret the legacy HS256 secret, or blank when the project signs with asymmetric keys only
 */
@ConfigurationProperties("guitarpal.supabase")
public record SupabaseProperties(String url, String jwtSecret) {

	public SupabaseProperties {
		// Fail at startup, not on the first request: without the URL no token can be checked.
		if (url == null || url.isBlank()) {
			throw new IllegalStateException("guitarpal.supabase.url is not set (SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL).");
		}
		url = url.endsWith("/") ? url.substring(0, url.length() - 1) : url;
		jwtSecret = jwtSecret == null || jwtSecret.isBlank() ? null : jwtSecret;
	}

	/** The {@code iss} Supabase writes into every session token. */
	public String issuer() {
		return url + "/auth/v1";
	}

	public String jwksUrl() {
		return issuer() + "/.well-known/jwks.json";
	}
}
