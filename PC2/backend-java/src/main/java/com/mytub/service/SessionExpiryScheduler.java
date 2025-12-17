package com.mytub.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

@Component
public class SessionExpiryScheduler {

    private static final Logger log = LoggerFactory.getLogger(SessionExpiryScheduler.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private KafkaProducer<String, String> producer;

    @Value("${kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${kafka.sessions.topic}")
    private String sessionsTopic;

    @Value("${kafka.irregularities.topic}")
    private String irregularitiesTopic;

    @Value("${sessions.grace.seconds}")
    private int graceSeconds;

    public SessionExpiryScheduler(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private void ensureProducer() {
        if (producer != null) return;
        Properties props = new Properties();
        props.put("bootstrap.servers", bootstrapServers);
        props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
        producer = new KafkaProducer<>(props);
        log.info("Kafka producer initialized for {}", bootstrapServers);
    }

    private record SessionRow(String sessionId, String spotId, Instant endTime, String status, Instant actualEndTime) {}

    private static class SessionRowMapper implements RowMapper<SessionRow> {
        @Override
        public SessionRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new SessionRow(
                    rs.getString("session_id"),
                    rs.getString("spot_id"),
                    rs.getTimestamp("end_time").toInstant(),
                    rs.getString("status"),
                    rs.getTimestamp("actual_end_time") != null ? rs.getTimestamp("actual_end_time").toInstant() : null
            );
        }
    }

    @Scheduled(fixedDelay = 3000)
    public void handleExpiryAndGrace() {
        try {
            ensureProducer();

            Instant now = Instant.now();

            // 1) Move ended ACTIVE sessions into GRACE, send SESSION_PAYMENT_REQUIRED
            List<SessionRow> toGrace = jdbcTemplate.query(
                    "SELECT session_id, spot_id, end_time, status, actual_end_time FROM parking_sessions WHERE status = 'ACTIVE' AND end_time <= NOW()",
                    new SessionRowMapper()
            );
            for (SessionRow s : toGrace) {
                int updated = jdbcTemplate.update(
                        "UPDATE parking_sessions SET status = 'GRACE', actual_end_time = COALESCE(actual_end_time, NOW()), updated_at = NOW() WHERE session_id = ? AND status = 'ACTIVE'",
                        s.sessionId()
                );
                if (updated > 0) {
                    Map<String, Object> payload = new HashMap<>();
                    payload.put("type", "SESSION_PAYMENT_REQUIRED");
                    payload.put("session_id", s.sessionId());
                    payload.put("spot_id", s.spotId());
                    payload.put("grace_seconds", graceSeconds);
                    payload.put("timestamp", now.toString());
                    payload.put("message", "Sessão terminou. Tem " + graceSeconds + "s para renovar o pagamento.");
                    String value = objectMapper.writeValueAsString(payload);
                    producer.send(new ProducerRecord<>(sessionsTopic, s.spotId(), value));
                    log.info("Grace started for session {} at spot {}", s.sessionId(), s.spotId());
                }
            }

            // 2) For GRACE sessions past grace window, mark EXPIRED and notify fiscal + client final notice
            List<SessionRow> toExpire = jdbcTemplate.query(
                    "SELECT session_id, spot_id, end_time, status, actual_end_time FROM parking_sessions WHERE status = 'GRACE' AND actual_end_time IS NOT NULL",
                    new SessionRowMapper()
            );
            for (SessionRow s : toExpire) {
                if (s.actualEndTime() == null) continue;
                Duration sinceEnd = Duration.between(s.actualEndTime(), now);
                if (sinceEnd.getSeconds() >= graceSeconds) {
                    int updated = jdbcTemplate.update(
                            "UPDATE parking_sessions SET status = 'EXPIRED', updated_at = NOW() WHERE session_id = ? AND status = 'GRACE'",
                            s.sessionId()
                    );
                    if (updated > 0) {
                        // Final notice to client
                        Map<String, Object> finalNotice = new HashMap<>();
                        finalNotice.put("type", "SESSION_FINAL_NOTICE");
                        finalNotice.put("session_id", s.sessionId());
                        finalNotice.put("spot_id", s.spotId());
                        finalNotice.put("timestamp", now.toString());
                        finalNotice.put("message", "Sessão expirada sem renovação. Fiscal será notificado.");
                        producer.send(new ProducerRecord<>(sessionsTopic, s.spotId(), objectMapper.writeValueAsString(finalNotice)));

                        // Notify fiscal / irregularity stream
                        Map<String, Object> irr = new HashMap<>();
                        irr.put("type", "SESSION_EXPIRED");
                        irr.put("spot_id", s.spotId());
                        irr.put("session_id", s.sessionId());
                        irr.put("timestamp", now.toString());
                        irr.put("message", "Sessão expirada sem renovação dentro do período de graça.");
                        producer.send(new ProducerRecord<>(irregularitiesTopic, s.spotId(), objectMapper.writeValueAsString(irr)));
                        log.info("Expired session {} at spot {} notified to fiscal", s.sessionId(), s.spotId());
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Session expiry handling failed: {}", e.getMessage());
        }
    }
}
