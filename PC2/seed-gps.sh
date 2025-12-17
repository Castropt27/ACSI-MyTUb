#!/bin/bash
# Auto-seed script that runs after containers start
sleep 3
echo "Seeding GPS coordinates..."
docker exec postgres-db psql -U backend -d sensor_data -c "
UPDATE sensor_readings SET gps_lat = 41.55387813, gps_lng = -8.42743078, rua = 'Mercado de Braga - Lugar 1', zone = 'mercado' WHERE sensor_id = '1';
UPDATE sensor_readings SET gps_lat = 41.55389013, gps_lng = -8.42745078, rua = 'Mercado de Braga - Lugar 2', zone = 'mercado' WHERE sensor_id = '2';
UPDATE sensor_readings SET gps_lat = 41.55390213, gps_lng = -8.42747078, rua = 'Mercado de Braga - Lugar 3', zone = 'mercado' WHERE sensor_id = '3';
UPDATE sensor_readings SET gps_lat = 41.55391413, gps_lng = -8.42749078, rua = 'Mercado de Braga - Lugar 4', zone = 'mercado' WHERE sensor_id = '4';
UPDATE sensor_readings SET gps_lat = 41.55392613, gps_lng = -8.42751078, rua = 'Mercado de Braga - Lugar 5', zone = 'mercado' WHERE sensor_id = '5';
UPDATE sensor_readings SET gps_lat = 41.55393813, gps_lng = -8.42753078, rua = 'Mercado de Braga - Lugar 6', zone = 'mercado' WHERE sensor_id = '6';
UPDATE sensor_readings SET gps_lat = 41.55395013, gps_lng = -8.42755078, rua = 'Mercado de Braga - Lugar 7', zone = 'mercado' WHERE sensor_id = '7';
" > /dev/null 2>&1
echo "GPS data seeded successfully"
