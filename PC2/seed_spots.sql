-- Seed parking spots with GPS coordinates and location info
-- Mercado de Braga parking spots

-- Update existing sensor readings with location data
UPDATE sensor_readings
SET gps_lat = 41.55387812968043,
    gps_lng = -8.427430784131518,
    rua = 'Mercado de Braga - Lugar 1',
    zone = 'mercado'
WHERE sensor_id = '1';

UPDATE sensor_readings
SET gps_lat = 41.55389012968043,
    gps_lng = -8.427450784131518,
    rua = 'Mercado de Braga - Lugar 2',
    zone = 'mercado'
WHERE sensor_id = '2';

UPDATE sensor_readings
SET gps_lat = 41.55390212968043,
    gps_lng = -8.427470784131518,
    rua = 'Mercado de Braga - Lugar 3',
    zone = 'mercado'
WHERE sensor_id = '3';

UPDATE sensor_readings
SET gps_lat = 41.55391412968043,
    gps_lng = -8.427490784131518,
    rua = 'Mercado de Braga - Lugar 4',
    zone = 'mercado'
WHERE sensor_id = '4';

UPDATE sensor_readings
SET gps_lat = 41.55392612968043,
    gps_lng = -8.427510784131518,
    rua = 'Mercado de Braga - Lugar 5',
    zone = 'mercado'
WHERE sensor_id = '5';

UPDATE sensor_readings
SET gps_lat = 41.55393812968043,
    gps_lng = -8.427530784131518,
    rua = 'Mercado de Braga - Lugar 6',
    zone = 'mercado'
WHERE sensor_id = '6';

UPDATE sensor_readings
SET gps_lat = 41.55395012968043,
    gps_lng = -8.427550784131518,
    rua = 'Mercado de Braga - Lugar 7',
    zone = 'mercado'
WHERE sensor_id = '7';

UPDATE sensor_readings
SET gps_lat = 41.55396212968043,
    gps_lng = -8.427570784131518,
    rua = 'Mercado de Braga - Lugar 8',
    zone = 'mercado'
WHERE sensor_id = '8';

UPDATE sensor_readings
SET gps_lat = 41.55397412968043,
    gps_lng = -8.427590784131518,
    rua = 'Mercado de Braga - Lugar 9',
    zone = 'mercado'
WHERE sensor_id = '9';

UPDATE sensor_readings
SET gps_lat = 41.55398612968043,
    gps_lng = -8.427610784131518,
    rua = 'Mercado de Braga - Lugar 10',
    zone = 'mercado'
WHERE sensor_id = '10';

-- Verify updates
SELECT sensor_id, gps_lat, gps_lng, rua, zone, COUNT(*) as readings
FROM sensor_readings
WHERE gps_lat IS NOT NULL
GROUP BY sensor_id, gps_lat, gps_lng, rua, zone
ORDER BY sensor_id;
