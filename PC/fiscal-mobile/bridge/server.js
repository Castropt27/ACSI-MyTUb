require('dotenv').config();
const { Kafka } = require('kafkajs');
const WebSocket = require('ws');

// Configuration
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9093').split(',');
const KAFKA_TOPIC_IRREGULARITIES = process.env.KAFKA_TOPIC || 'notifications.irregularities';
const KAFKA_TOPIC_SENSOR = 'sensor.raw'; // NEW: Topic for live sensor data
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fiscal-bridge-group';
const WS_PORT = parseInt(process.env.WS_PORT || '8081');

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

// WebSocket connection handler
wss.on('connection', (ws) => {
    console.log('📱 New client connected');
    clients.add(ws);

    ws.on('close', () => {
        console.log('📱 Client disconnected');
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
    });
});

/**
 * Broadcast message to all connected WebSocket clients
 */
function broadcast(message) {
    const payload = JSON.stringify(message);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
}

// Kafka setup
const kafka = new Kafka({
    clientId: 'fiscal-bridge',
    brokers: KAFKA_BROKERS,
});

const consumerIrregularities = kafka.consumer({ groupId: KAFKA_GROUP_ID });
const consumerSensor = kafka.consumer({ groupId: `${KAFKA_GROUP_ID}-sensor` });

/**
 * Start sensor.raw consumer (live spot updates)
 */
async function startSensorConsumer() {
    try {
        console.log('🔌 Starting sensor.raw consumer...');

        await consumerSensor.connect();
        await consumerSensor.subscribe({ topic: KAFKA_TOPIC_SENSOR, fromBeginning: false });

        console.log(`✅ Subscribed to topic: ${KAFKA_TOPIC_SENSOR}`);

        await consumerSensor.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const rawValue = message.value.toString();
                    const sensorData = JSON.parse(rawValue);

                    console.log(`📍 Sensor update: Spot ${sensorData.id} - ${sensorData.ocupado ? 'OCUPADO' : 'LIVRE'}`);

                    // FIXED GPS COORDINATES (hardcoded para Praça do Comércio)
                    const FIXED_GPS = {
                        lat: 41.55387813,
                        lng: -8.42743078
                    };

                    // Create WebSocket message for frontend
                    const wsMessage = {
                        type: 'SENSOR_UPDATE',
                        spotId: sensorData.id,
                        ocupado: sensorData.ocupado,
                        timestamp: sensorData.timestamp,
                        gps: {
                            lat: sensorData.gps_lat || FIXED_GPS.lat,  // Use sensor GPS or fixed
                            lng: sensorData.gps_lng || FIXED_GPS.lng
                        },
                        rua: sensorData.rua || 'Praça do Comércio',
                        zone: sensorData.zone || 'A1'
                    };

                    console.log(`📤 Broadcasting sensor update to ${clients.size} client(s)`);
                    console.log(`   GPS: ${wsMessage.gps.lat}, ${wsMessage.gps.lng}`);
                    broadcast(wsMessage);

                } catch (error) {
                    console.error('❌ Error processing sensor message:', error);
                }
            }
        });

        console.log('✅ Sensor consumer running');

    } catch (error) {
        console.error('❌ Error starting sensor consumer:', error);
    }
}

/**
 * Start irregularities consumer
 */
async function startIrregularitiesConsumer() {
    try {
        console.log('🚨 Starting irregularities consumer...');

        await consumerIrregularities.connect();
        await consumerIrregularities.subscribe({ topic: KAFKA_TOPIC_IRREGULARITIES, fromBeginning: true });

        console.log(`✅ Subscribed to topic: ${KAFKA_TOPIC_IRREGULARITIES} (compacted - from beginning)`);

        await consumerIrregularities.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const rawValue = message.value.toString();
                    const infractionData = JSON.parse(rawValue);

                    console.log(`📨 Received infraction from Kafka: ${rawValue}`);

                    const { type, spot_id, ocupado, timestamp, message: messageText } = infractionData;

                    // Handle IRREGULARITY_RESOLVED - remove alert
                    if (type === 'IRREGULARITY_RESOLVED') {
                        const wsMessage = {
                            type: 'IRREGULARITY_RESOLVED',
                            spotId: spot_id,
                            timestamp: timestamp || new Date().toISOString(),
                            message: messageText || `Lugar ${spot_id} resolvido`
                        };
                        console.log(`✅ Broadcast RESOLVED for spot ${spot_id}`);
                        broadcast(wsMessage);
                        return; // Exit early
                    }

                    const occupiedSince = new Date(timestamp);
                    const now = new Date();
                    const minutesOccupied = Math.floor((now - occupiedSince) / (1000 * 60));

                    const wsMessage = {
                        type: type || 'IRREGULARITY_DETECTED',
                        spotId: spot_id,
                        occupiedSince: occupiedSince.toISOString(),
                        minutesOccupied: minutesOccupied,
                        timestamp: now.toISOString(),
                        message: messageText
                    };

                    console.log(`📤 Broadcasting infraction to ${clients.size} client(s)`);
                    broadcast(wsMessage);

                } catch (error) {
                    console.error('❌ Error processing infraction message:', error);
                }
            },
        });

        console.log('✅ Irregularities consumer running');

    } catch (error) {
        console.error('❌ Error starting irregularities consumer:', error);
    }
}

/**
 * Main function to start both Kafka consumers and WebSocket bridge
 */
async function start() {
    try {
        console.log('🚀 Starting myTUB Fiscal Bridge...');
        console.log(`📡 Kafka Brokers: ${KAFKA_BROKERS.join(', ')}`);
        console.log(`📋 Topics: ${KAFKA_TOPIC_SENSOR}, ${KAFKA_TOPIC_IRREGULARITIES}`);
        console.log(`🔌 WebSocket Port: ${WS_PORT}`);

        // Start both consumers
        await Promise.all([
            startSensorConsumer(),
            startIrregularitiesConsumer()
        ]);

        console.log('✅ All consumers running. Waiting for messages...');
        console.log(`✅ WebSocket server running on ws://localhost:${WS_PORT}`);

    } catch (error) {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown() {
    console.log('\n🛑 Shutting down...');
    try {
        await consumerIrregularities.disconnect();
        await consumerSensor.disconnect();
        wss.close(() => {
            console.log('✅ WebSocket server closed');
        });
        console.log('✅ Kafka consumers disconnected');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the bridge
start();

