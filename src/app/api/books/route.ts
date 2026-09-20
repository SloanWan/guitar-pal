import type { NextRequest } from "next/server";
import { GET as forwardGet, POST as forwardPost } from "@/app/api/books/[...path]/route";

/**
 * `/api/books` itself (list, create): the catch-all above needs at least one
 * segment, so the bare path forwards with an empty one.
 */
const empty = { params: Promise.resolve({ path: [] as string[] }) };

export const dynamic = "force-dynamic";

export const GET = (request: NextRequest) => forwardGet(request, empty);
export const POST = (request: NextRequest) => forwardPost(request, empty);
