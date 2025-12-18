package com.mytub.controller;

import com.mytub.model.SessionRequest;
import jakarta.validation.Valid;
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
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.*;

@RestController
@RequestMapping("/api")
public class SessionsController {

    private static final Logger log = LoggerFactory.getLogger(SessionsController.class);
    private final JdbcTemplate jdbcTemplate;

    @Value("${sessions.renew.tolerance.seconds}")
    private int renewToleranceSeconds;

    public SessionsController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private record SessionDto(String sessionId, String spotId, LocalDateTime start, LocalDateTime end,
                              String licensePlate, Double valor, String metodo, String telemovel, String status) {}

    private static class SessionRowMapper implements RowMapper<SessionDto> {
        @Override
        public SessionDto mapRow(ResultSet rs, int rowNum) throws SQLException {
            return new SessionDto(
                    rs.getString("session_id"),
                    rs.getString("spot_id"),
                    rs.getTimestamp("start_time").toLocalDateTime(),
                    rs.getTimestamp("end_time").toLocalDateTime(),
                    rs.getString("license_plate"),
                    rs.getObject("amount_paid") != null ? rs.getDouble("amount_paid") : null,
                    rs.getString("payment_method"),
                    rs.getString("phone"),
                    rs.getString("status")
            );
        }
    }

    @PostMapping("/sessions")
    public ResponseEntity<Map<String, Object>> create(@Valid @RequestBody SessionRequest req) {
        String sessionId = "S" + UUID.randomUUID().toString().replace("-", "").substring(0, 12).toUpperCase();
        LocalDateTime start = LocalDateTime.now();
        LocalDateTime end = start.plusMinutes(req.getDurationMinutes());

        jdbcTemplate.update(
                """
                INSERT INTO parking_sessions (session_id, spot_id, user_name, start_time, end_time, status, amount_paid, license_plate, payment_method, phone)
                VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)
                """,
                sessionId, req.getSpotId(), req.getUserName(), start, end, req.getValor(), req.getLicensePlate(), req.getMetodo(), req.getTelemovel()
        );

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        res.put("sessionId", sessionId);
        res.put("start", start.toString());
        res.put("end", end.toString());
        res.put("timestamp", Instant.now().toString());
        return ResponseEntity.status(HttpStatus.CREATED).body(res);
    }

    @GetMapping("/sessions/{sessionId}")
    public ResponseEntity<SessionDto> get(@PathVariable("sessionId") String sessionId) {
        List<SessionDto> list = jdbcTemplate.query("SELECT * FROM parking_sessions WHERE session_id = ?", new SessionRowMapper(), sessionId);
        if (list.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(list.get(0));
    }

    @GetMapping("/sessions")
    public ResponseEntity<Map<String, Object>> list(
            @RequestParam(value = "licensePlate", required = false) String licensePlate,
            @RequestParam(value = "userName", required = false) String userName,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        StringBuilder sql = new StringBuilder("SELECT * FROM parking_sessions");
        List<Object> params = new ArrayList<>();
        List<String> where = new ArrayList<>();

        if (licensePlate != null && !licensePlate.isBlank()) {
            where.add("license_plate = ?");
            params.add(licensePlate);
        }
        if (userName != null && !userName.isBlank()) {
            where.add("user_name = ?");
            params.add(userName);
        }

        if (!where.isEmpty()) {
            sql.append(" WHERE ").append(String.join(" AND ", where));
        }

        sql.append(" ORDER BY start_time DESC LIMIT ? OFFSET ?");
        params.add(size);
        params.add(page * size);

        List<SessionDto> list = jdbcTemplate.query(sql.toString(), new SessionRowMapper(), params.toArray());

        Map<String, Object> res = new HashMap<>();
        res.put("timestamp", Instant.now().toString());
        res.put("page", page);
        res.put("size", size);
        res.put("sessions", list);
        return ResponseEntity.ok(res);
    }

    @PutMapping("/sessions/{sessionId}/extend")
    public ResponseEntity<SessionDto> extend(@PathVariable("sessionId") String sessionId, @RequestParam("additionalMinutes") int additionalMinutes) {
        jdbcTemplate.update("UPDATE parking_sessions SET end_time = end_time + (INTERVAL '1 minute' * ?) , updated_at = NOW() WHERE session_id = ? AND status = 'ACTIVE'", additionalMinutes, sessionId);
        return get(sessionId);
    }

    @PostMapping("/sessions/{sessionId}/renew")
    public ResponseEntity<?> renew(
            @PathVariable("sessionId") String sessionId,
            @RequestParam("additionalMinutes") int additionalMinutes,
            @RequestParam(value = "metodo", required = false) String metodo,
            @RequestParam(value = "telemovel", required = false) String telemovel
    ) {
        // Get session info
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
            "SELECT spot_id, status, actual_end_time, EXTRACT(EPOCH FROM (NOW() - COALESCE(actual_end_time, end_time))) as seconds_since_end FROM parking_sessions WHERE session_id = ?", 
            sessionId
        );
        if (rows.isEmpty()) return ResponseEntity.notFound().build();
        
        String spotId = (String) rows.get(0).get("spot_id");
        String status = (String) rows.get(0).get("status");
        Number secondsSinceEnd = (Number) rows.get(0).get("seconds_since_end");
        double elapsed = secondsSinceEnd != null ? secondsSinceEnd.doubleValue() : 0;

        // Check if fine was already created for this spot
        Integer fineCount = jdbcTemplate.queryForObject(
            "SELECT COUNT(*) FROM fines WHERE spot_id = ? AND status IN ('Emitida', 'Notificada') AND created_at > NOW() - INTERVAL '5 minutes'",
            Integer.class,
            spotId
        );
        
        if (fineCount != null && fineCount > 0) {
            log.warn("Renewal blocked for session {} - fine already created for spot {}", sessionId, spotId);
            Map<String, Object> error = new HashMap<>();
            error.put("error", "FINE_ALREADY_ISSUED");
            error.put("message", "Não é possível renovar. Coima já emitida para este lugar.");
            error.put("spot_id", spotId);
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(error);
        }

        if ("ACTIVE".equals(status)) {
            jdbcTemplate.update(
                    "UPDATE parking_sessions SET end_time = end_time + (INTERVAL '1 minute' * ?), payment_method = COALESCE(?, payment_method), phone = COALESCE(?, phone), updated_at = NOW() WHERE session_id = ?",
                    additionalMinutes, metodo, telemovel, sessionId
            );
            log.info("Renewed ACTIVE session {} with +{} minutes", sessionId, additionalMinutes);
            return ResponseEntity.ok(get(sessionId).getBody());
        }

        if ("GRACE".equals(status)) {
            jdbcTemplate.update(
                    "UPDATE parking_sessions SET end_time = end_time + (INTERVAL '1 minute' * ?), status = 'ACTIVE', payment_method = COALESCE(?, payment_method), phone = COALESCE(?, phone), updated_at = NOW() WHERE session_id = ?",
                    additionalMinutes, metodo, telemovel, sessionId
            );
            log.info("Renewed GRACE session {} with +{} minutes, restored to ACTIVE", sessionId, additionalMinutes);
            return ResponseEntity.ok(get(sessionId).getBody());
        }

        // Allow renew of EXPIRED sessions within tolerance window (even after irregularity sent)
        if ("EXPIRED".equals(status) && elapsed <= renewToleranceSeconds) {
            jdbcTemplate.update(
                    "UPDATE parking_sessions SET end_time = NOW() + (INTERVAL '1 minute' * ?), status = 'ACTIVE', payment_method = COALESCE(?, payment_method), phone = COALESCE(?, phone), updated_at = NOW() WHERE session_id = ?",
                    additionalMinutes, metodo, telemovel, sessionId
            );
            
            // Clear sent_irregularities to make irregularity disappear from fiscal view
            jdbcTemplate.update(
                "DELETE FROM sent_irregularities WHERE spot_id = ? AND occupied_since IN (SELECT timestamp FROM latest_sensor_readings WHERE sensor_id = ?)",
                spotId, spotId
            );
            
            log.info("Renewed EXPIRED session {} ({}s late) with +{} minutes, restored to ACTIVE, cleared irregularity", sessionId, (int)elapsed, additionalMinutes);
            return ResponseEntity.ok(get(sessionId).getBody());
        }

        log.warn("Renewal rejected for session {} - status={}, elapsed={}s (tolerance={}s)", sessionId, status, (int)elapsed, renewToleranceSeconds);
        Map<String, Object> error = new HashMap<>();
        error.put("error", "RENEWAL_EXPIRED");
        error.put("message", "Tempo de renovação expirado. Contacte o fiscal.");
        return ResponseEntity.status(HttpStatus.CONFLICT).body(error);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> cancel(@PathVariable("sessionId") String sessionId) {
        int rows = jdbcTemplate.update("UPDATE parking_sessions SET status = 'CANCELLED', actual_end_time = NOW(), updated_at = NOW() WHERE session_id = ? AND status = 'ACTIVE'", sessionId);
        if (rows == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions/active")
    public ResponseEntity<Map<String, Object>> active(@RequestParam("spotId") String spotId) {
        List<SessionDto> list = jdbcTemplate.query(
            "SELECT * FROM parking_sessions WHERE spot_id = ? AND status = 'ACTIVE' AND end_time > NOW() ORDER BY start_time DESC LIMIT 1",
                new SessionRowMapper(), spotId);
        Map<String, Object> res = new HashMap<>();
        res.put("timestamp", Instant.now().toString());
        res.put("active", list.isEmpty() ? null : list.get(0));
        return ResponseEntity.ok(res);
    }
}
