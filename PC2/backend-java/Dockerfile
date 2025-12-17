# Multi-stage build for Spring Boot
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /workspace

# Copy only pom first to leverage dependency caching
COPY pom.xml .

# Pre-fetch dependencies and cache Maven repo to speed up builds
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests -Dmaven.test.skip=true dependency:go-offline

# Now copy sources and build the jar using cached dependencies
COPY src ./src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -DskipTests -Dmaven.test.skip=true package

FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /workspace/target/backend-java-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8000
ENTRYPOINT ["java","-jar","/app/app.jar"]
