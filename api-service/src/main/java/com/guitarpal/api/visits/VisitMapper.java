package com.guitarpal.api.visits;

import java.util.List;
import java.util.UUID;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/** The SQL is in {@code resources/mapper/VisitMapper.xml}. */
@Mapper
public interface VisitMapper {

	/** The player's most opened things, most first; ties go to the latest. */
	List<Visit> findTopByUser(@Param("userId") UUID userId, @Param("limit") int limit);
}
