# api-service

Guitar Pal's Java back end (#472). The back end is moving off Supabase one endpoint
at a time. This service is where each endpoint goes. Sign-in stays with Supabase: the service
only checks the session token a request carries. The data stays in Supabase's
Postgres, reached by a role of the service's own.

Java 21, Spring Boot 4.1, MyBatis, Maven (through the wrapper — no local Maven needed).

## Run it locally

```bash
cd api-service
export SUPABASE_URL=https://<project-ref>.supabase.co
export API_DATABASE_URL='jdbc:postgresql://<pooler-host>:5432/postgres?sslmode=require'
export API_DATABASE_USER=api_service.<project-ref>
export API_DATABASE_PASSWORD=<password>
./mvnw spring-boot:run          # http://localhost:8080
```

| Variable | What it is |
|---|---|
| `SUPABASE_URL` | The project URL; `NEXT_PUBLIC_SUPABASE_URL` is read when it is unset, so the server's one `.env` serves both apps. Required. |
| `SUPABASE_JWT_SECRET` | Legacy projects only (HS256). Unset: HS256 tokens are refused. |
| `API_DATABASE_URL` / `_USER` / `_PASSWORD` | The JDBC connection as the `api_service` role (`scripts/create-api-service-role.sql`). |
| `PORT` | Defaults to 8080. |

Without a database at hand, `TestApiServiceApplication` (under `src/test`) starts the app on a Postgres in Docker: `./mvnw spring-boot:test-run`.

Try it with a real session token. Signed in on the site, the session is in the
`sb-<project-ref>-auth-token` cookie: base64-encoded JSON whose `access_token` is the token.

```bash
curl -H "Authorization: Bearer $TOKEN" 'http://localhost:8080/v1/me/visits?limit=5'
curl http://localhost:8080/actuator/health          # open, no token
```

## Test it

```bash
./mvnw verify
```

Docker has to be running: the database tests start a Postgres 17 (Supabase's major version) through Testcontainers. CI runs the same command (`.github/workflows/ci.yml`, job `api-service`). The tests:

| Test | What it proves |
|---|---|
| `config/SupabaseJwtDecoderTest` | Which tokens pass: ES256 / RS256 against a key set, HS256 against the secret. Wrong issuer, audience, key or signature fails, as do an expired token and a `sub` that is not a user id. Keys are made in the test; nothing touches the network. |
| `visits/VisitMapperTest` | The SQL itself, on a real Postgres: one player never gets another's rows; the order, the tie-break and the limit hold. |
| `visits/VisitControllerTest` | The web layer with the service mocked: 401 without a token, the JSON shape, 400 for a bad `limit`, and a 500 that leaks nothing. |
| `ApiServiceApplicationTests` | The whole app starts. Only the health check is open. |

## How a request flows

```
request ─► Spring Security filter chain        config/SecurityConfig
             │  no or bad token → 401
             ▼
           SupabaseJwtDecoder                   config/SupabaseJwtDecoder
             │  signature (JWKS or HS256), issuer, audience, expiry, sub is a UUID
             ▼
           VisitController                      visits/VisitController
             │  user id = the token's sub (never a request parameter)
             │  @Min / @Max on parameters → 400 problem
             ▼
           VisitService                         visits/VisitService
             │  business rules; who may see what
             ▼
           VisitMapper (interface)              visits/VisitMapper
             │  bound by MyBatis to the XML
             ▼
           SQL                                  resources/mapper/VisitMapper.xml
             ▼
           Postgres (as api_service)
```

Errors come back as RFC 9457 problems (`application/problem+json`, `common/ApiExceptionHandler`). An unexpected exception is logged in full and answered with a bare 500.

**Who may see a row is decided here, not by RLS.** On Supabase a browser query runs as the signed-in user, and RLS policies keep each player to their own rows. This service connects as one role for everyone. Its policies are `using (true)`, so every user-scoped query must be keyed by the token's `sub`. The user id is never taken from the path, the query or the body.

## Add an endpoint

1. **Grant the table.** Add a `grant` and a `create policy … to api_service` to `scripts/create-api-service-role.sql`. Run it in the Supabase SQL editor, then `npm run db:schema` in the repo root and commit the snapshot.
2. **A package for the feature** under `com.guitarpal.api` (like `visits/`). In it:
   - a record for the row, plus one for the reply if it differs;
   - a `@Mapper` interface;
   - a `@Service`;
   - a `@RestController`.

   Use constructor injection, not field injection.
3. **The SQL** goes in `src/main/resources/mapper/<Name>Mapper.xml`, with the namespace set to the interface's full name. Bind values with `#{}`, never `${}`: `${}` splices text into the SQL.
4. **Tests**:
   - the mapper against Testcontainers (`@MybatisTest`, `@Import(TestcontainersConfiguration.class)`, a script under `src/test/resources/db/` for the table);
   - the controller with `@WebMvcTest` and `jwt()`.

   Port the TypeScript tests the endpoint already has.
5. **Switch it over in Next** (below), and keep the TypeScript path until the Java one has run in production.

## How Next reaches it

Next stays the only thing the browser talks to. When `JAVA_API_URL` is set (`http://api:8080` on the server), a route handler forwards the request — with the caller's `Authorization` header — to this service. Unset, the route keeps its TypeScript implementation. This is how `BOOK_SERVICE_URL` already works for the book service. It means:

- Vercel previews, which have no Java service, keep working;
- any endpoint can be switched back by unsetting the variable.

On the server the service is a compose service behind the `api` profile, with no public port: `docker compose --profile api up --build -d`. A plain deploy leaves it alone until an endpoint uses it.

## Roadmap

| Step | What moves |
|---|---|
| J0 (this) | The skeleton and the example slice, `GET /v1/me/visits`. |
| J1 | Telemetry ingest: `POST /telemetry` (rate limits, crawler filter, validation, insert into `telemetry_events`). |
| J2 | The monitor's aggregation: `GET /monitor/summary` (P75 per route and metric, error rates, allow-listed users); `/monitor` reads it. |
| J3 | Shared read-only data: the chord library, share links. |
| J4 | The user tables (patterns, tabs, favourites), authorized here. Plugs into the offline data-access seam (#469). |
| J5 | Later: the database on our own Postgres, then Storage and sign-in. |
