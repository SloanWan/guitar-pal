package com.guitarpal.api.visits;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.guitarpal.api.config.SecurityConfig;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The web layer alone: the real security chain and error handler, the service mocked.
 * {@code jwt()} stands in for a token the decoder accepted; the decoder has its own test.
 */
@WebMvcTest(VisitController.class)
@Import(SecurityConfig.class)
class VisitControllerTest {

	private static final UUID PLAYER = UUID.fromString("11111111-1111-1111-1111-111111111111");

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private VisitService service;

	@Test
	void refusesARequestWithoutAToken() throws Exception {
		mvc.perform(get("/v1/me/visits")).andExpect(status().isUnauthorized());
		verify(service, never()).topVisits(any(), anyInt());
	}

	@Test
	void refusesAMalformedToken() throws Exception {
		mvc.perform(get("/v1/me/visits").header("Authorization", "Bearer not-a-jwt"))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void answersWithTheTokenHoldersVisits() throws Exception {
		when(service.topVisits(PLAYER, 5)).thenReturn(List.of(
				new Visit("strum", "folk-strum", 9, OffsetDateTime.parse("2026-11-01T10:00:00Z"))));

		mvc.perform(get("/v1/me/visits").with(jwt().jwt(token -> token.subject(PLAYER.toString()))))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.visits[0].kind").value("strum"))
				.andExpect(jsonPath("$.visits[0].target").value("folk-strum"))
				.andExpect(jsonPath("$.visits[0].count").value(9))
				.andExpect(jsonPath("$.visits[0].lastAt").value("2026-11-01T10:00:00Z"));
	}

	@Test
	void passesTheLimitThrough() throws Exception {
		mvc.perform(get("/v1/me/visits?limit=20").with(jwt().jwt(token -> token.subject(PLAYER.toString()))))
				.andExpect(status().isOk());
		verify(service).topVisits(PLAYER, 20);
	}

	@Test
	void answersALimitOutOfRangeWithAProblem() throws Exception {
		mvc.perform(get("/v1/me/visits?limit=0").with(jwt().jwt(token -> token.subject(PLAYER.toString()))))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
		verify(service, never()).topVisits(any(), anyInt());
	}

	@Test
	void hidesAnUnexpectedErrorBehindAProblem() throws Exception {
		when(service.topVisits(any(), anyInt())).thenThrow(new IllegalStateException("database password is hunter2"));

		mvc.perform(get("/v1/me/visits").with(jwt().jwt(token -> token.subject(PLAYER.toString()))))
				.andExpect(status().isInternalServerError())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.detail").value("Something went wrong."));
	}
}
