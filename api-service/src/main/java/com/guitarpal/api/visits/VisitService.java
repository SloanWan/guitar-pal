package com.guitarpal.api.visits;

import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;

/**
 * Reads a player's visits.
 *
 * <p>The {@code api_service} role this connects as may read every row (its policy is
 * {@code using (true)}: Postgres cannot know which player a request is for), so the
 * {@code userId} it is handed — always the verified token's {@code sub}, never a value
 * from the request — is what keeps each player to their own rows.
 */
@Service
public class VisitService {

	private final VisitMapper visits;

	public VisitService(VisitMapper visits) {
		this.visits = visits;
	}

	public List<Visit> topVisits(UUID userId, int limit) {
		return visits.findTopByUser(userId, limit);
	}
}
