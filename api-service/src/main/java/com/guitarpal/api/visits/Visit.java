package com.guitarpal.api.visits;

import java.time.OffsetDateTime;

/**
 * One thing a player opened, and how often: a row of {@code user_visits}.
 *
 * <p>Row and reply are the same shape here, so one record serves both. When a reply
 * needs less than the row (or more), give it a record of its own.
 *
 * @param kind   {@code strum}, {@code tab}, {@code chord} or {@code book}
 * @param target the thing's id within its kind
 */
public record Visit(String kind, String target, int count, OffsetDateTime lastAt) {
}
