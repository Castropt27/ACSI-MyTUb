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
import java.time.Instant;
import java.util.*;

@Component
public class IrregularitiesPublisher {

    private static final Logger log = LoggerFactory.getLogger(IrregularitiesPublisher.class);

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Set<String> sentKeys = Collections.synchronizedSet(new HashSet<>());

    private KafkaProducer<String, String> producer;

    @Value("${kafka.bootstrap-servers}")
    private String bootstrapServers;

    @Value("${kafka.irregularities.topic}")
    private String irregularitiesTopic;

    public IrregularitiesPublisher(JdbcTemplate jdbcTemplate) {
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

    private record Irregularity(String spotId, String occupiedSince, double minutesOccupied) {}

    private static class IrregularityRowMapper implements RowMapper<Irregularity> {
        @Override
        public Irregularity mapRow(ResultSet rs, int rowNum) throws SQLException {
            String spotId = rs.getString("spot_id");
            String occupiedSince = rs.getString("occupied_since");
            double minutes = rs.getDouble("minutes_occupied");
            return new Irregularity(spotId, occupiedSince, minutes);
        }
    }

    @Scheduled(fixedDelayString = "${irregularities.publish.interval.ms}")
    public void publishIrregularities() {
        try {
            ensureProducer();

            String sql = """
                SELECT spot_id, occupied_since, minutes_occupied
                FROM irregularities
                WHERE is_irregular = true AND minutes_occupied > 0.5
                ORDER BY minutes_occupied DESC
            """;

            List<Irregularity> list = jdbcTemplate.query(sql, new IrregularityRowMapper());
            Instant now = Instant.now();

            for (Irregularity irr : list) {
                String key = irr.spotId() + ":" + irr.occupiedSince();
                if (sentKeys.contains(key)) continue;

                Map<String, Object> payload = new HashMap<>();
                payload.put("type", "IRREGULARITY_DETECTED");
                payload.put("spot_id", irr.spotId());
                payload.put("ocupado", true);
                payload.put("minutes_occupied", irr.minutesOccupied());
                payload.put("timestamp", now.toString());
                payload.put("message", "Lugar " + irr.spotId() + " ocupado sem sessão válida");

                String value = objectMapper.writeValueAsString(payload);
                producer.send(new ProducerRecord<>(irregularitiesTopic, irr.spotId(), value));
                sentKeys.add(key);
                log.info("Published irregularity for spot {} to topic {}", irr.spotId(), irregularitiesTopic);
            }
        } catch (Exception e) {
            log.warn("Irregularities publish failed: {}", e.getMessage());
        }
    }
}
