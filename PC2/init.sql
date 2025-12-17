-- Database initialization script for sensor data
CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(50) NOT NULL,
    ocupado BOOLEAN NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB,
    gps_lat DECIMAL(10, 8),
    gps_lng DECIMAL(11, 8),
    rua VARCHAR(255),
    zone VARCHAR(100)
);

-- Users table (clientes e fiscais)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE,
    role VARCHAR(50) NOT NULL, -- 'CLIENTE' or 'FISCAL'
    fiscal_id VARCHAR(50) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Parking sessions table
CREATE TABLE IF NOT EXISTS parking_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    spot_id VARCHAR(50) NOT NULL,
    user_id INTEGER REFERENCES users(id),
    user_name VARCHAR(255),
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    actual_end_time TIMESTAMP,
    extended_times INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'ACTIVE', -- ACTIVE, COMPLETED, CANCELLED
    amount_paid DECIMAL(10, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fines table
CREATE TABLE IF NOT EXISTS fines (
    id SERIAL PRIMARY KEY,
    fine_id VARCHAR(100) UNIQUE NOT NULL,
    spot_id VARCHAR(50) NOT NULL,
    fiscal_id VARCHAR(50) NOT NULL,
    fiscal_name VARCHAR(255) NOT NULL,
    license_plate VARCHAR(50),
    issue_timestamp TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'Emitida', -- Emitida, Notificada, Paga, Em Recurso, Anulada
    reason TEXT,
    amount DECIMAL(10, 2),
    photo_url TEXT,
    photos JSONB,
    notes TEXT,
    gps_lat DECIMAL(10, 8),
    gps_lng DECIMAL(11, 8),
    location_address TEXT,
    history JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sensor_id ON sensor_readings(sensor_id);
CREATE INDEX IF NOT EXISTS idx_sensor_timestamp ON sensor_readings(timestamp);
CREATE INDEX IF NOT EXISTS idx_sensor_received_at ON sensor_readings(received_at);
CREATE INDEX IF NOT EXISTS idx_sensor_ocupado ON sensor_readings(ocupado);

CREATE INDEX IF NOT EXISTS idx_sessions_spot_id ON parking_sessions(spot_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON parking_sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_end_time ON parking_sessions(end_time);

CREATE INDEX IF NOT EXISTS idx_fines_spot_id ON fines(spot_id);
CREATE INDEX IF NOT EXISTS idx_fines_status ON fines(status);
CREATE INDEX IF NOT EXISTS idx_fines_fiscal_id ON fines(fiscal_id);

-- Sent irregularities tracking (prevent duplicate notifications after fine creation)
CREATE TABLE IF NOT EXISTS sent_irregularities (
    id SERIAL PRIMARY KEY,
    spot_id VARCHAR(50) NOT NULL,
    occupied_since TIMESTAMP NOT NULL,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason VARCHAR(50) DEFAULT 'IRREGULARITY', -- IRREGULARITY or FINE_CREATED
    UNIQUE(spot_id, occupied_since)
);

CREATE INDEX IF NOT EXISTS idx_sent_irreg_spot ON sent_irregularities(spot_id);
CREATE INDEX IF NOT EXISTS idx_sent_irreg_occupied_since ON sent_irregularities(occupied_since);

-- Create view for latest readings per sensor
CREATE OR REPLACE VIEW latest_sensor_readings AS
SELECT DISTINCT ON (sensor_id) 
    sensor_id,
    ocupado,
    timestamp,
    received_at,
    gps_lat,
    gps_lng,
    rua,
    zone
FROM sensor_readings
ORDER BY sensor_id, received_at DESC;

-- View for active sessions
CREATE OR REPLACE VIEW active_sessions AS
SELECT 
    s.*,
    CASE 
        WHEN s.end_time < NOW() THEN 'EXPIRED'
        ELSE 'ACTIVE'
    END as actual_status
FROM parking_sessions s
WHERE s.status = 'ACTIVE';

-- View for irregularities (occupied spots without valid session)
CREATE OR REPLACE VIEW irregularities AS
SELECT 
    sr.sensor_id as spot_id,
    sr.ocupado,
    sr.timestamp as occupied_since,
    sr.gps_lat,
    sr.gps_lng,
    sr.rua,
    sr.zone,
    EXTRACT(EPOCH FROM (NOW() - sr.timestamp)) / 60 as minutes_occupied,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM parking_sessions ps 
            WHERE ps.spot_id = sr.sensor_id 
            AND ps.status = 'ACTIVE' 
            AND ps.end_time > NOW()
        ) THEN false
        WHEN EXISTS (
            SELECT 1 FROM sent_irregularities si
            WHERE si.spot_id = sr.sensor_id
            AND si.occupied_since = sr.timestamp
        ) THEN false
        ELSE true
    END as is_irregular
FROM latest_sensor_readings sr
WHERE sr.ocupado = true;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO backend;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO backend;
