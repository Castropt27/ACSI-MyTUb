package com.mytub.controller;

import com.mytub.model.Spot;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class SpotsController {

    private final JdbcTemplate jdbcTemplate;

    public SpotsController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    private static class SpotRowMapper implements RowMapper<Spot> {
        @Override
        public Spot mapRow(ResultSet rs, int rowNum) throws SQLException {
            Spot s = new Spot();
            s.setSpotId(rs.getString("spot_id"));
            s.setOcupado(rs.getBoolean("ocupado"));
            s.setMinutesSinceChange(rs.getObject("minutes_since_change") != null ? rs.getDouble("minutes_since_change") : null);
            s.setGpsLat(rs.getObject("gps_lat") != null ? rs.getDouble("gps_lat") : null);
            s.setGpsLng(rs.getObject("gps_lng") != null ? rs.getDouble("gps_lng") : null);
            s.setRua(rs.getString("rua"));
            s.setZone(rs.getString("zone"));
            s.setHasValidSession(rs.getBoolean("has_valid_session"));
            s.setActiveSessionId(rs.getString("active_session_id"));
            return s;
        }
    }

    private static final String BASE_QUERY = """
        SELECT 
            sr.sensor_id as spot_id,
            sr.ocupado,
            sr.timestamp as last_update,
            sr.gps_lat,
            sr.gps_lng,
            sr.rua,
            sr.zone,
            CASE 
                WHEN EXISTS (
                    SELECT 1 FROM parking_sessions ps 
                    WHERE ps.spot_id = sr.sensor_id 
                    AND ps.status = 'ACTIVE' 
                    AND ps.end_time > NOW()
                ) THEN true
                ELSE false
            END as has_valid_session,
            (
                SELECT session_id FROM parking_sessions ps 
                WHERE ps.spot_id = sr.sensor_id 
                AND ps.status = 'ACTIVE' 
                AND ps.end_time > NOW()
                ORDER BY start_time DESC
                LIMIT 1
            ) as active_session_id,
            EXTRACT(EPOCH FROM (NOW() - sr.timestamp)) / 60 as minutes_since_change
        FROM latest_sensor_readings sr
        ORDER BY sr.sensor_id
    """;

    @GetMapping("/api/spots")
    public Map<String, Object> getClientSpots() {
        List<Spot> spots = jdbcTemplate.query(BASE_QUERY, new SpotRowMapper());
        List<Map<String, Object>> sanitized = spots.stream().map(s -> {
            Map<String, Object> m = new HashMap<>();
            m.put("spotId", s.getSpotId());
            m.put("ocupado", s.isOcupado());
            m.put("minutesSinceChange", s.getMinutesSinceChange());
            m.put("gpsLat", s.getGpsLat());
            m.put("gpsLng", s.getGpsLng());
            return m;
        }).toList();
        Map<String, Object> res = new HashMap<>();
        res.put("timestamp", Instant.now().toString());
        res.put("total_spots", sanitized.size());
        res.put("spots", sanitized);
        return res;
    }

    @GetMapping("/api/fiscal/spots")
    public Map<String, Object> getFiscalSpots() {
        // same payload for now; could add extra fields later
        return getClientSpots();
    }
}
