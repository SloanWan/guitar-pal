# ---- build: the jar, with the dependency download cached on pom.xml ----
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY .mvn .mvn
COPY mvnw pom.xml ./
# Dependencies only, so a source change reuses this layer instead of downloading again.
# Maven Central is slow to reach from some networks; retry a dropped download rather than fail.
ENV MAVEN_ARGS="-Daether.connector.http.retryHandler.count=8"
RUN ./mvnw -B -q dependency:go-offline
COPY src src
# CI runs the tests (they need Docker for Testcontainers, which a build has not).
RUN ./mvnw -B -q package -DskipTests && cp target/api-service-*.jar app.jar

# ---- runner ----
FROM eclipse-temurin:21-jre AS runner
WORKDIR /app
RUN groupadd --system --gid 1001 api && useradd --system --uid 1001 --gid api api
COPY --from=build --chown=api:api /src/app.jar ./app.jar
USER api
EXPOSE 8080
# The server is small and shared with the web app: size the heap off the
# container's memory limit rather than the host's.
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75"
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
