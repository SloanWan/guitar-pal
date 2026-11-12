package com.guitarpal.api;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The whole application on a real Postgres: the context starts (the mapper XML parses,
 * the datasource connects) and the filter chain lets only the health check through
 * without a token.
 */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ApiServiceApplicationTests {

	@Autowired
	private MockMvc mvc;

	@Test
	void healthIsOpen() throws Exception {
		mvc.perform(get("/actuator/health")).andExpect(status().isOk());
	}

	@Test
	void everythingElseWantsAToken() throws Exception {
		mvc.perform(get("/v1/me/visits")).andExpect(status().isUnauthorized());
		mvc.perform(get("/actuator/env")).andExpect(status().isUnauthorized());
	}
}
