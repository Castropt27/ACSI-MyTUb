package com.mytub.controller;

import com.mytub.model.SessionRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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
    public ResponseEntity<SessionDto> get(@PathVariable String sessionId) {
        List<SessionDto> list = jdbcTemplate.query("SELECT * FROM parking_sessions WHERE session_id = ?", new SessionRowMapper(), sessionId);
        if (list.isEmpty()) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(list.get(0));
    }

    @PutMapping("/sessions/{sessionId}/extend")
    public ResponseEntity<SessionDto> extend(@PathVariable String sessionId, @RequestParam int additionalMinutes) {
        jdbcTemplate.update("UPDATE parking_sessions SET end_time = end_time + (INTERVAL '1 minute' * ?) , updated_at = NOW() WHERE session_id = ? AND status = 'ACTIVE'", additionalMinutes, sessionId);
        return get(sessionId);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public ResponseEntity<Void> cancel(@PathVariable String sessionId) {
        int rows = jdbcTemplate.update("UPDATE parking_sessions SET status = 'CANCELLED', actual_end_time = NOW(), updated_at = NOW() WHERE session_id = ? AND status = 'ACTIVE'", sessionId);
        if (rows == 0) return ResponseEntity.notFound().build();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/sessions/active")
    public ResponseEntity<Map<String, Object>> active(@RequestParam String spotId) {
        List<SessionDto> list = jdbcTemplate.query(
                "SELECT * FROM parking_sessions WHERE spot_id = ? AND status = 'ACTIVE' AND end_time > NOW() ORDER BY start_time DESC LIMIT 1",
                new SessionRowMapper(), spotId);
        Map<String, Object> res = new HashMap<>();
        res.put("timestamp", Instant.now().toString());
        res.put("active", list.isEmpty() ? null : list.get(0));
        return ResponseEntity.ok(res);
    }
}
