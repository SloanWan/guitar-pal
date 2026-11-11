package com.guitarpal.api.visits;

import java.util.List;

/** An object rather than a bare array, so a field can join it later without breaking callers. */
public record VisitsResponse(List<Visit> visits) {
}
