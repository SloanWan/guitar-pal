package com.guitarpal.api.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.Date;
import java.util.List;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSSigner;
import com.nimbusds.jose.crypto.ECDSASigner;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jose.jwk.Curve;
import com.nimbusds.jose.jwk.ECKey;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import com.nimbusds.jose.jwk.gen.ECKeyGenerator;
import com.nimbusds.jose.jwk.gen.RSAKeyGenerator;
import com.nimbusds.jose.jwk.source.ImmutableJWKSet;
import com.nimbusds.jose.proc.SecurityContext;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.PlainJWT;
import com.nimbusds.jwt.SignedJWT;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtException;

/**
 * Tokens signed with keys made here, so nothing reaches the network: the JWKS a real
 * project publishes is stood in for by an in-memory key set.
 */
class SupabaseJwtDecoderTest {

	private static final String ISSUER = "https://test-project.supabase.co/auth/v1";
	private static final String SECRET = "a-legacy-hs256-secret-of-at-least-32-bytes!!";
	private static final String USER = "11111111-1111-1111-1111-111111111111";

	private static ECKey ecKey;
	private static RSAKey rsaKey;
	private static ECKey strangerKey;
	private static SupabaseJwtDecoder decoder;
	private static SupabaseJwtDecoder withoutSecret;

	@BeforeAll
	static void keys() throws JOSEException {
		ecKey = new ECKeyGenerator(Curve.P_256).keyID("ec-1").generate();
		rsaKey = new RSAKeyGenerator(2048).keyID("rsa-1").generate();
		// Same key id as the project's key, different key: a forged signature.
		strangerKey = new ECKeyGenerator(Curve.P_256).keyID("ec-1").generate();
		var jwks = new ImmutableJWKSet<SecurityContext>(
				new JWKSet(List.of(ecKey.toPublicJWK(), rsaKey.toPublicJWK())));
		decoder = SupabaseJwtDecoder.create(ISSUER, jwks, SECRET);
		withoutSecret = SupabaseJwtDecoder.create(ISSUER, jwks, null);
	}

	private static JWTClaimsSet.Builder claims() {
		return new JWTClaimsSet.Builder()
				.issuer(ISSUER)
				.audience("authenticated")
				.subject(USER)
				.issueTime(Date.from(Instant.now()))
				.expirationTime(Date.from(Instant.now().plusSeconds(3600)));
	}

	private static String sign(JWSAlgorithm alg, String keyId, JWSSigner signer, JWTClaimsSet claims) throws JOSEException {
		var jwt = new SignedJWT(new JWSHeader.Builder(alg).keyID(keyId).build(), claims);
		jwt.sign(signer);
		return jwt.serialize();
	}

	private static String es256(JWTClaimsSet claims) throws JOSEException {
		return sign(JWSAlgorithm.ES256, "ec-1", new ECDSASigner(ecKey), claims);
	}

	@Test
	void acceptsAnEs256SessionToken() throws JOSEException {
		Jwt jwt = decoder.decode(es256(claims().build()));
		assertThat(jwt.getSubject()).isEqualTo(USER);
	}

	@Test
	void acceptsAnRs256SessionToken() throws JOSEException {
		String token = sign(JWSAlgorithm.RS256, "rsa-1", new RSASSASigner(rsaKey), claims().build());
		assertThat(decoder.decode(token).getSubject()).isEqualTo(USER);
	}

	@Test
	void acceptsAnHs256TokenWhenTheSecretIsSet() throws JOSEException {
		String token = sign(JWSAlgorithm.HS256, null, new MACSigner(SECRET), claims().build());
		assertThat(decoder.decode(token).getSubject()).isEqualTo(USER);
	}

	@Test
	void refusesAnHs256TokenWithoutASecret() throws JOSEException {
		String token = sign(JWSAlgorithm.HS256, null, new MACSigner(SECRET), claims().build());
		assertThatThrownBy(() -> withoutSecret.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAnHs256TokenSignedWithAnotherSecret() throws JOSEException {
		String token = sign(JWSAlgorithm.HS256, null, new MACSigner("another-secret-another-secret-another!!"), claims().build());
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAForgedSignature() throws JOSEException {
		String token = sign(JWSAlgorithm.ES256, "ec-1", new ECDSASigner(strangerKey), claims().build());
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAnUnknownKeyId() throws JOSEException {
		String token = sign(JWSAlgorithm.ES256, "not-ours", new ECDSASigner(ecKey), claims().build());
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAnotherProjectsIssuer() throws JOSEException {
		String token = es256(claims().issuer("https://other.supabase.co/auth/v1").build());
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAnotherAudience() throws JOSEException {
		String token = es256(claims().audience("anon").build());
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAnExpiredToken() throws JOSEException {
		// Past the minute of clock skew the validator allows.
		String token = es256(claims().expirationTime(Date.from(Instant.now().minusSeconds(120))).build());
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesASubThatIsNotAUserId() throws JOSEException {
		assertThatThrownBy(() -> decoder.decode(es256(claims().subject("service_role").build())))
				.isInstanceOf(JwtException.class);
		assertThatThrownBy(() -> decoder.decode(es256(claims().subject(null).build())))
				.isInstanceOf(JwtException.class);
	}

	@Test
	void refusesAnUnsignedToken() {
		String token = new PlainJWT(claims().build()).serialize();
		assertThatThrownBy(() -> decoder.decode(token)).isInstanceOf(JwtException.class);
	}

	@Test
	void refusesSomethingThatIsNotAToken() {
		assertThatThrownBy(() -> decoder.decode("not-a-jwt")).isInstanceOf(JwtException.class);
	}
}
