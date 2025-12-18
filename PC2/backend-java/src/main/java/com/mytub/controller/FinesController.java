package com.mytub.controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mytub.model.Fine;
import com.mytub.model.FineRequest;
import com.mytub.model.FineUpdateRequest;
import jakarta.validation.Valid;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.*;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api")
public class FinesController {

    private static final Logger log = LoggerFactory.getLogger(FinesController.class);
    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    private KafkaProducer<String, String> producer;

    @Value("${kafka.bootstrap-servers}")
    private String bootstrapServers;

    public FinesController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private void ensureProducer() {
        if (producer != null) return;
        try {
            Properties props = new Properties();
            props.put("bootstrap.servers", bootstrapServers);
            props.put("key.serializer", "org.apache.kafka.common.serialization.StringSerializer");
            props.put("value.serializer", "org.apache.kafka.common.serialization.StringSerializer");
            producer = new KafkaProducer<>(props);
            log.info("Kafka producer for fines initialized");
        } catch (Exception e) {
            log.warn("Kafka producer init failed: {}", e.getMessage());
        }
    }

    private static class FineRowMapper implements RowMapper<Fine> {
        private final ObjectMapper mapper = new ObjectMapper();
        
        @Override
        public Fine mapRow(ResultSet rs, int rowNum) throws SQLException {
            Fine f = new Fine();
            f.setFineId(rs.getString("fine_id"));
            f.setSpotId(rs.getString("spot_id"));
            f.setFiscalId(rs.getString("fiscal_id"));
            f.setFiscalName(rs.getString("fiscal_name"));
            f.setLicensePlate(rs.getString("license_plate"));
            
            Timestamp ts = rs.getTimestamp("issue_timestamp");
            if (ts != null) f.setIssueTimestamp(ts.toLocalDateTime());
            
            f.setStatus(rs.getString("status"));
            f.setReason(rs.getString("reason"));
            f.setAmount(rs.getObject("amount") != null ? rs.getDouble("amount") : null);
            f.setPhotoUrl(rs.getString("photo_url"));
            
            String photosJson = rs.getString("photos");
            if (photosJson != null) {
                try {
                    f.setPhotos(mapper.readValue(photosJson, List.class));
                } catch (Exception e) {
                    f.setPhotos(null);
                }
            }
            
            f.setNotes(rs.getString("notes"));
            f.setGpsLat(rs.getObject("gps_lat") != null ? rs.getDouble("gps_lat") : null);
            f.setGpsLng(rs.getObject("gps_lng") != null ? rs.getDouble("gps_lng") : null);
            f.setLocationAddress(rs.getString("location_address"));
            f.setHistory(rs.getString("history"));
            
            Timestamp created = rs.getTimestamp("created_at");
            if (created != null) f.setCreatedAt(created.toLocalDateTime());
            
            Timestamp updated = rs.getTimestamp("updated_at");
            if (updated != null) f.setUpdatedAt(updated.toLocalDateTime());
            
            return f;
        }
    }

    @PostMapping("/fines")
    public ResponseEntity<Fine> createFine(@Valid @RequestBody FineRequest request) {
        String fineId = "F" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        LocalDateTime now = LocalDateTime.now();

        // Get spot location from database
        Map<String, Object> spotData = jdbcTemplate.queryForMap(
            "SELECT gps_lat, gps_lng, rua, zone FROM latest_sensor_readings WHERE sensor_id = ?",
            request.getSpotId()
        );

        Double gpsLat = (Double) spotData.get("gps_lat");
        Double gpsLng = (Double) spotData.get("gps_lng");
        String rua = (String) spotData.get("rua");
        String zone = (String) spotData.get("zone");
        String locationAddress = rua != null ? rua : ("Zona " + zone);

        // Create history entry
        List<Map<String, Object>> history = new ArrayList<>();
        Map<String, Object> historyEntry = new HashMap<>();
        historyEntry.put("status", "Emitida");
        historyEntry.put("timestamp", Instant.now().toString());
        historyEntry.put("action", "Coima criada");
        historyEntry.put("fiscal_id", request.getFiscalId());
        history.add(historyEntry);

        String historyJson;
        String photosJson = null;
        try {
            historyJson = objectMapper.writeValueAsString(history);
            if (request.getPhotos() != null) {
                photosJson = objectMapper.writeValueAsString(request.getPhotos());
            }
        } catch (JsonProcessingException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }

        // Prepare JSONB for photos if present
        org.postgresql.util.PGobject photosPg = null;
        try {
            if (photosJson != null) {
                photosPg = new org.postgresql.util.PGobject();
                photosPg.setType("jsonb");
                photosPg.setValue(photosJson);
            }
        } catch (Exception e) {
            log.warn("Failed to prepare JSONB for photos: {}", e.getMessage());
        }

        // Prepare JSONB for history
        org.postgresql.util.PGobject historyPg = null;
        try {
            if (historyJson != null) {
                historyPg = new org.postgresql.util.PGobject();
                historyPg.setType("jsonb");
                historyPg.setValue(historyJson);
            }
        } catch (Exception e) {
            log.warn("Failed to prepare JSONB for history: {}", e.getMessage());
        }

        // Insert fine
        jdbcTemplate.update(
            """
            INSERT INTO fines 
            (fine_id, spot_id, fiscal_id, fiscal_name, license_plate, issue_timestamp, status, 
             reason, amount, photo_url, photos, notes, gps_lat, gps_lng, location_address, history)
            VALUES (?, ?, ?, ?, ?, ?, 'Emitida', ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            fineId, request.getSpotId(), request.getFiscalId(), request.getFiscalName(),
            request.getLicensePlate(), now, request.getReason(), request.getAmount(),
            request.getPhotoBase64(), photosPg != null ? photosPg : null, request.getNotes(),
            gpsLat, gpsLng, locationAddress, historyPg != null ? historyPg : null
        );

        // Mark irregularity as resolved
        jdbcTemplate.update(
            """
            INSERT INTO sent_irregularities (spot_id, occupied_since, reason)
            SELECT ?, timestamp, 'FINE_CREATED'
            FROM latest_sensor_readings
            WHERE sensor_id = ?
            ON CONFLICT DO NOTHING
            """,
            request.getSpotId(), request.getSpotId()
        );

        // Publish to Kafka
        ensureProducer();
        if (producer != null) {
            try {
                Map<String, Object> event = new HashMap<>();
                event.put("type", "FINE_CREATED");
                event.put("fine_id", fineId);
                event.put("spot_id", request.getSpotId());
                event.put("license_plate", request.getLicensePlate());
                event.put("fiscal_id", request.getFiscalId());
                event.put("fiscal_name", request.getFiscalName());
                event.put("amount", request.getAmount());
                event.put("reason", request.getReason());
                event.put("timestamp", Instant.now().toString());
                event.put("message", "Coima emitida: " + request.getReason() + ". Valor: €" + request.getAmount());

                producer.send(new ProducerRecord<>("client.notifications", fineId, objectMapper.writeValueAsString(event)));
                log.info("Fine notification sent to Kafka: {}", fineId);
            } catch (Exception e) {
                log.warn("Failed to publish fine to Kafka: {}", e.getMessage());
            }
        }

        // Fetch and return created fine
        Fine created = jdbcTemplate.queryForObject(
            "SELECT * FROM fines WHERE fine_id = ?",
            new FineRowMapper(),
            fineId
        );

        log.info("Fine created: {} for spot {}", fineId, request.getSpotId());
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/fines/{fineId}")
    public ResponseEntity<Fine> getFine(@PathVariable("fineId") String fineId) {
        List<Fine> results = jdbcTemplate.query(
            "SELECT * FROM fines WHERE fine_id = ?",
            new FineRowMapper(),
            fineId
        );

        if (results.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        return ResponseEntity.ok(results.get(0));
    }

    @GetMapping("/fines")
    public ResponseEntity<Map<String, Object>> listFines(
        @RequestParam(value = "status", required = false) String status,
        @RequestParam(value = "fiscalId", required = false) String fiscalId,
        @RequestParam(value = "spotId", required = false) String spotId
    ) {
        StringBuilder sql = new StringBuilder("SELECT * FROM fines WHERE 1=1");
        List<Object> params = new ArrayList<>();

        if (status != null) {
            sql.append(" AND status = ?");
            params.add(status);
        }
        if (fiscalId != null) {
            sql.append(" AND fiscal_id = ?");
            params.add(fiscalId);
        }
        if (spotId != null) {
            sql.append(" AND spot_id = ?");
            params.add(spotId);
        }

        sql.append(" ORDER BY issue_timestamp DESC");

        List<Fine> fines = jdbcTemplate.query(sql.toString(), new FineRowMapper(), params.toArray());

        Map<String, Object> response = new HashMap<>();
        response.put("total", fines.size());
        response.put("fines", fines);
        response.put("timestamp", Instant.now().toString());

        return ResponseEntity.ok(response);
    }

    @GetMapping("/fines/fiscal/{fiscalId}")
    public ResponseEntity<Map<String, Object>> listFinesByFiscal(@PathVariable("fiscalId") String fiscalId) {
        List<Fine> fines = jdbcTemplate.query(
            "SELECT * FROM fines WHERE fiscal_id = ? ORDER BY issue_timestamp DESC",
            new FineRowMapper(),
            fiscalId
        );

        Map<String, Object> response = new HashMap<>();
        response.put("total", fines.size());
        response.put("fines", fines);
        response.put("timestamp", Instant.now().toString());

        return ResponseEntity.ok(response);
    }

    @PutMapping("/fines/{fineId}")
    public ResponseEntity<Fine> updateFine(
        @PathVariable("fineId") String fineId,
        @Valid @RequestBody FineUpdateRequest request
    ) {
        // Get current fine
        List<Fine> existing = jdbcTemplate.query(
            "SELECT * FROM fines WHERE fine_id = ?",
            new FineRowMapper(),
            fineId
        );

        if (existing.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Fine current = existing.get(0);
        
        // Parse existing history
        List<Map<String, Object>> history;
        try {
            history = objectMapper.readValue(current.getHistory(), List.class);
        } catch (Exception e) {
            history = new ArrayList<>();
        }

        // Add new history entry
        Map<String, Object> newEntry = new HashMap<>();
        newEntry.put("status", request.getStatus());
        newEntry.put("timestamp", Instant.now().toString());
        newEntry.put("action", "Status alterado para " + request.getStatus());
        if (request.getNote() != null) {
            newEntry.put("note", request.getNote());
        }
        history.add(newEntry);

        String historyJson;
        try {
            historyJson = objectMapper.writeValueAsString(history);
        } catch (JsonProcessingException e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }

        // Prepare JSONB for history update
        org.postgresql.util.PGobject historyPg = null;
        try {
            historyPg = new org.postgresql.util.PGobject();
            historyPg.setType("jsonb");
            historyPg.setValue(historyJson);
        } catch (Exception e) {
            log.warn("Failed to prepare JSONB for history update: {}", e.getMessage());
        }

        // Update fine with proper JSONB
        jdbcTemplate.update(
            "UPDATE fines SET status = ?, history = ?, updated_at = NOW() WHERE fine_id = ?",
            request.getStatus(), historyPg != null ? historyPg : historyJson, fineId
        );

        // Fetch updated fine
        Fine updated = jdbcTemplate.queryForObject(
            "SELECT * FROM fines WHERE fine_id = ?",
            new FineRowMapper(),
            fineId
        );

        log.info("Fine {} updated to status {}", fineId, request.getStatus());
        return ResponseEntity.ok(updated);
    }

    @DeleteMapping("/fines/{fineId}")
    public ResponseEntity<Void> deleteFine(@PathVariable("fineId") String fineId) {
        int rows = jdbcTemplate.update("DELETE FROM fines WHERE fine_id = ?", fineId);
        
        if (rows == 0) {
            return ResponseEntity.notFound().build();
        }

        log.info("Fine {} deleted", fineId);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/fiscal/verify/{spotId}")
    public ResponseEntity<Map<String, Object>> verifySpot(@PathVariable("spotId") String spotId) {
        // Get spot info
        List<Map<String, Object>> spotResults = jdbcTemplate.queryForList(
            """
            SELECT 
                sr.sensor_id as spot_id,
                sr.ocupado,
                sr.timestamp as last_update,
                sr.gps_lat,
                sr.gps_lng,
                sr.rua,
                sr.zone,
                EXTRACT(EPOCH FROM (NOW() - sr.timestamp)) / 60 as minutes_occupied
            FROM latest_sensor_readings sr
            WHERE sr.sensor_id = ?
            """,
            spotId
        );

        if (spotResults.isEmpty()) {
            return ResponseEntity.notFound().build();
        }

        Map<String, Object> spot = spotResults.get(0);

        // Check for active session
        List<Map<String, Object>> sessions = jdbcTemplate.queryForList(
            """
            SELECT *, 
                   EXTRACT(EPOCH FROM (end_time - NOW())) / 60 as minutes_remaining
            FROM parking_sessions 
            WHERE spot_id = ? AND status = 'ACTIVE' AND end_time > NOW()
            ORDER BY start_time DESC
            LIMIT 1
            """,
            spotId
        );

        boolean hasValidSession = !sessions.isEmpty();
        double minutesOccupied = ((Number) spot.get("minutes_occupied")).doubleValue();
        boolean isIrregular = (Boolean) spot.get("ocupado") && !hasValidSession && minutesOccupied > 5;

        Map<String, Object> response = new HashMap<>();
        response.put("spot_id", spotId);
        response.put("ocupado", spot.get("ocupado"));
        response.put("has_valid_session", hasValidSession);
        response.put("is_irregular", isIrregular);
        response.put("minutes_occupied", Math.round(minutesOccupied * 100.0) / 100.0);
        
        Map<String, Object> location = new HashMap<>();
        location.put("gps_lat", spot.get("gps_lat"));
        location.put("gps_lng", spot.get("gps_lng"));
        location.put("rua", spot.get("rua"));
        location.put("zone", spot.get("zone"));
        response.put("location", location);
        
        response.put("active_session", sessions.isEmpty() ? null : sessions.get(0));

        return ResponseEntity.ok(response);
    }
}
