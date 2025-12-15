-- Database initialization script for sensor data
CREATE TABLE IF NOT EXISTS sensor_readings (
    id SERIAL PRIMARY KEY,
    sensor_id VARCHAR(50) NOT NULL,
    ocupado BOOLEAN NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    raw_data JSONB
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_sensor_id ON sensor_readings(sensor_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON sensor_readings(timestamp);
CREATE INDEX IF NOT EXISTS idx_received_at ON sensor_readings(received_at);

-- Create view for latest readings per sensor
CREATE OR REPLACE VIEW latest_sensor_readings AS
SELECT DISTINCT ON (sensor_id) 
    sensor_id,
    ocupado,
    timestamp,
    received_at
FROM sensor_readings
ORDER BY sensor_id, received_at DESC;

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO backend;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO backend;
