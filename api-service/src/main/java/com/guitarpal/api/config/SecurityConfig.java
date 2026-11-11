package com.guitarpal.api.config;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Every request but the health check carries a Supabase session token.
 *
 * <p>Sign-in stays with Supabase: the browser (or the Next server, forwarding)
 * sends {@code Authorization: Bearer <access token>}, and this service only checks it.
 * No sessions and no cookies, so no CSRF token either.
 */
@Configuration
@EnableConfigurationProperties(SupabaseProperties.class)
public class SecurityConfig {

	@Bean
	SecurityFilterChain apiFilterChain(HttpSecurity http) throws Exception {
		http
				.csrf(AbstractHttpConfigurer::disable)
				.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
				.authorizeHttpRequests(requests -> requests
						.requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
						.anyRequest().authenticated())
				// An invalid or missing token answers 401 with a WWW-Authenticate header.
				.oauth2ResourceServer(server -> server.jwt(Customizer.withDefaults()));
		return http.build();
	}

	@Bean
	JwtDecoder jwtDecoder(SupabaseProperties supabase) {
		return SupabaseJwtDecoder.forProject(supabase);
	}
}
