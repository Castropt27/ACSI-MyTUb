require('dotenv').config();
const { Kafka } = require('kafkajs');
const WebSocket = require('ws');

// Configuration
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9093').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'notifications.irregularities';
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

const consumer = kafka.consumer({ groupId: KAFKA_GROUP_ID });

/**
 * Main function to start Kafka consumer and WebSocket bridge
 */
async function start() {
    try {
        console.log('🚀 Starting myTUB Fiscal Bridge...');
        console.log(`📡 Kafka Brokers: ${KAFKA_BROKERS.join(', ')}`);
        console.log(`📋 Topic: ${KAFKA_TOPIC}`);
        console.log(`🔌 WebSocket Port: ${WS_PORT}`);
        console.log(`🚨 Consuming infractions from PC2 backend...`);

        // Connect to Kafka
        await consumer.connect();
        console.log('✅ Connected to Kafka');

        // Subscribe to topic
        await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });
        console.log(`✅ Subscribed to topic: ${KAFKA_TOPIC}`);

        // Process messages
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    // Parse Kafka message (infraction event from PC2)
                    const rawValue = message.value.toString();
                    const infractionData = JSON.parse(rawValue);

                    console.log(`📨 Received infraction from Kafka: ${rawValue}`);

                    // Extract infraction fields from PC2 format
                    const { type, spot_id, ocupado, timestamp, message: messageText } = infractionData;

                    // Calculate minutes occupied from timestamp
                    const occupiedSince = new Date(timestamp);
                    const now = new Date();
                    const minutesOccupied = Math.floor((now - occupiedSince) / (1000 * 60));

                    // Create WebSocket message for frontend
                    const wsMessage = {
                        type: type || 'IRREGULARITY_DETECTED',
                        spotId: spot_id,
                        occupiedSince: occupiedSince.toISOString(),
                        minutesOccupied: minutesOccupied,
                        timestamp: now.toISOString(),
                        message: messageText
                    };

                    console.log(`📤 Broadcasting to ${clients.size} WebSocket client(s): ${JSON.stringify(wsMessage)}`);

                    // Broadcast to all connected clients
                    broadcast(wsMessage);

                } catch (error) {
                    console.error('❌ Error processing Kafka message:', error);
                }
            },
        });

        console.log('✅ Kafka consumer running. Waiting for infractions...');
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
        await consumer.disconnect();
        wss.close(() => {
            console.log('✅ WebSocket server closed');
        });
        console.log('✅ Kafka consumer disconnected');
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
