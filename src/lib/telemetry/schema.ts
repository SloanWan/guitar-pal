import * as z from "zod";
import {
	ERROR_SOURCES,
	MAX_EVENTS_PER_BATCH,
	MAX_MESSAGE_CHARS,
	MAX_ROUTE_CHARS,
	MAX_STACK_CHARS,
	VITAL_NAMES,
	VITAL_RATINGS,
	type TelemetryBatch,
	type TelemetryEvent,
} from "./events";

/**
 * The route's check of a batch (#447). Server-only: the client builds events
 * from `events.ts` and never needs zod for it.
 */

const base = {
	route: z.string().min(1).max(MAX_ROUTE_CHARS),
	viewport: z.enum(["phone", "desktop"]),
	build: z.string().max(64).optional(),
};

const errorEvent = z.strictObject({
	kind: z.literal("error"),
	source: z.enum(ERROR_SOURCES),
	message: z.string().max(MAX_MESSAGE_CHARS),
	stack: z.string().max(MAX_STACK_CHARS).optional(),
	digest: z.string().max(64).optional(),
	...base,
});

const vitalEvent = z.strictObject({
	kind: z.literal("vital"),
	name: z.enum(VITAL_NAMES),
	// CLS is unitless and small; the rest are milliseconds. An hour bounds a real one.
	value: z.number().nonnegative().max(3_600_000),
	rating: z.enum(VITAL_RATINGS),
	...base,
});

export const telemetryEvent = z.discriminatedUnion("kind", [errorEvent, vitalEvent]);

export const telemetryBatch = z.strictObject({
	events: z.array(telemetryEvent).min(1).max(MAX_EVENTS_PER_BATCH),
});

// The schema and the hand-written types must describe the same thing.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameEvent: Same<z.infer<typeof telemetryEvent>, TelemetryEvent> = true;
const sameBatch: Same<z.infer<typeof telemetryBatch>, TelemetryBatch> = true;
void sameEvent;
void sameBatch;
