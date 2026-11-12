package com.guitarpal.api.config;

import java.net.MalformedURLException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.text.ParseException;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import javax.crypto.spec.SecretKeySpec;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.jwk.source.JWKSource;
import com.nimbusds.jose.jwk.source.JWKSourceBuilder;
import com.nimbusds.jose.proc.JWSVerificationKeySelector;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTParser;
import com.nimbusds.jwt.proc.DefaultJWTProcessor;

import org.springframework.security.oauth2.core.DelegatingOAuth2TokenValidator;
import org.springframework.security.oauth2.core.OAuth2TokenValidator;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtClaimValidator;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;

/**
 * Checks a Supabase session token, the one check every user-scoped query rests on.
 *
 * <p>The service reads Postgres directly, so row-level security does not keep one
 * player out of another's rows here: the {@code sub} of a token this decoder accepted
 * does, on every query. Mirrors {@code book-service/app/auth.py}. Newer projects sign
 * with asymmetric keys published as a JWKS, legacy ones with a shared HS256 secret; the
 * token's header says which, and each is checked against its own source only, so an
 * HS256 token is never verified against a JWKS key or the other way round.
 */
public final class SupabaseJwtDecoder implements JwtDecoder {

	/** Supabase issues session tokens for this audience; the anon key's token has none. */
	static final String AUDIENCE = "authenticated";

	private final JwtDecoder asymmetric;
	private final JwtDecoder hs256;

	private SupabaseJwtDecoder(JwtDecoder asymmetric, JwtDecoder hs256) {
		this.asymmetric = asymmetric;
		this.hs256 = hs256;
	}

	/** The decoder for the configured project, its keys fetched from the project's JWKS. */
	public static SupabaseJwtDecoder forProject(SupabaseProperties supabase) {
		JWKSource<SecurityContext> jwks;
		try {
			// Caches the keys and refetches on an unknown key id, so a rotation on the
			// Supabase side is picked up without a restart. Nothing is fetched until the
			// first token arrives, so the service starts without reaching Supabase.
			jwks = JWKSourceBuilder.create(URI.create(supabase.jwksUrl()).toURL()).retrying(true).build();
		} catch (MalformedURLException e) {
			throw new IllegalStateException("Bad Supabase URL: " + supabase.url(), e);
		}
		return create(supabase.issuer(), jwks, supabase.jwtSecret());
	}

	/**
	 * @param hs256Secret the legacy secret, or null to refuse HS256 tokens
	 */
	public static SupabaseJwtDecoder create(String issuer, JWKSource<SecurityContext> jwks, String hs256Secret) {
		OAuth2TokenValidator<Jwt> validator = validator(issuer);

		DefaultJWTProcessor<SecurityContext> processor = new DefaultJWTProcessor<>();
		processor.setJWSKeySelector(new JWSVerificationKeySelector<>(Set.of(JWSAlgorithm.ES256, JWSAlgorithm.RS256), jwks));
		// Expiry and the rest are Spring's validators' job, below, for both schemes alike.
		processor.setJWTClaimsSetVerifier((claims, context) -> {
		});
		NimbusJwtDecoder asymmetric = new NimbusJwtDecoder(processor);
		asymmetric.setJwtValidator(validator);

		NimbusJwtDecoder hs256 = null;
		if (hs256Secret != null) {
			SecretKeySpec key = new SecretKeySpec(hs256Secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
			hs256 = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
			hs256.setJwtValidator(validator);
		}
		return new SupabaseJwtDecoder(asymmetric, hs256);
	}

	private static OAuth2TokenValidator<Jwt> validator(String issuer) {
		return new DelegatingOAuth2TokenValidator<>(
				// Expiry (with a minute of clock skew) and the issuer: a token from another
				// Supabase project fails here even before its unknown key id would.
				JwtValidators.createDefaultWithIssuer(issuer),
				new JwtClaimValidator<List<String>>("aud", aud -> aud != null && aud.contains(AUDIENCE)),
				// Every query is keyed by this; a token without a user id is no session.
				new JwtClaimValidator<String>("sub", SupabaseJwtDecoder::isUuid));
	}

	private static boolean isUuid(String sub) {
		if (sub == null) return false;
		try {
			UUID.fromString(sub);
			return true;
		} catch (IllegalArgumentException e) {
			return false;
		}
	}

	@Override
	public Jwt decode(String token) throws JwtException {
		String alg;
		try {
			alg = JWTParser.parse(token).getHeader().getAlgorithm().getName();
		} catch (ParseException | RuntimeException e) {
			throw new BadJwtException("Malformed token.", e);
		}
		if (alg.equals("HS256")) {
			if (hs256 == null) throw new BadJwtException("HS256 token but no SUPABASE_JWT_SECRET is configured.");
			return hs256.decode(token);
		}
		if (alg.equals("ES256") || alg.equals("RS256")) {
			return asymmetric.decode(token);
		}
		throw new BadJwtException("Unsupported token algorithm " + alg + ".");
	}
}
