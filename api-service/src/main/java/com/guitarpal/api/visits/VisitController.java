package com.guitarpal.api.visits;

import java.util.UUID;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The example slice: the whole path a ported endpoint takes, from token to SQL.
 *
 * <p>There is no user id in the path or the query. Whose visits these are comes
 * from the token alone, so one player cannot ask for another's.
 */
@RestController
@RequestMapping("/v1/me/visits")
public class VisitController {

	private final VisitService service;

	public VisitController(VisitService service) {
		this.service = service;
	}

	/** {@code GET /v1/me/visits?limit=5}; a limit outside 1–50 answers 400. */
	@GetMapping
	public VisitsResponse list(
			@AuthenticationPrincipal Jwt jwt,
			@RequestParam(defaultValue = "5") @Min(1) @Max(50) int limit) {
		// The decoder has already refused a token whose sub is not a UUID.
		UUID userId = UUID.fromString(jwt.getSubject());
		return new VisitsResponse(service.topVisits(userId, limit));
	}
}
