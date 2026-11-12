package com.guitarpal.api.visits;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import com.guitarpal.api.TestcontainersConfiguration;

import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.test.autoconfigure.MybatisTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.jdbc.Sql;

/** The mapper's SQL against a real Postgres (Testcontainers), not a mock of it. */
@MybatisTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TestcontainersConfiguration.class)
@Sql("/db/user_visits.sql")
class VisitMapperTest {

	private static final UUID PLAYER = UUID.fromString("11111111-1111-1111-1111-111111111111");
	private static final UUID OTHER = UUID.fromString("22222222-2222-2222-2222-222222222222");

	@Autowired
	private VisitMapper mapper;

	@Test
	void listsOnlyThatPlayersVisitsMostOpenedFirst() {
		List<Visit> visits = mapper.findTopByUser(PLAYER, 10);

		assertThat(visits).extracting(Visit::target).containsExactly("folk-strum", "travis-1", "C|maj7", "b-1");
		assertThat(visits).extracting(Visit::target).doesNotContain("island");
	}

	@Test
	void breaksATieByTheLatestVisit() {
		List<Visit> visits = mapper.findTopByUser(PLAYER, 10);

		// travis-1 and C|maj7 were both opened 4 times; travis-1 more recently.
		assertThat(visits.get(1).target()).isEqualTo("travis-1");
		assertThat(visits.get(2).target()).isEqualTo("C|maj7");
	}

	@Test
	void mapsEveryColumn() {
		Visit first = mapper.findTopByUser(OTHER, 10).getFirst();

		assertThat(first.kind()).isEqualTo("strum");
		assertThat(first.target()).isEqualTo("island");
		assertThat(first.count()).isEqualTo(50);
		assertThat(first.lastAt()).isEqualTo(OffsetDateTime.parse("2026-11-07T10:00:00Z"));
	}

	@Test
	void honoursTheLimit() {
		assertThat(mapper.findTopByUser(PLAYER, 2)).hasSize(2);
	}

	@Test
	void aStrangerHasNone() {
		assertThat(mapper.findTopByUser(UUID.randomUUID(), 10)).isEmpty();
	}
}
