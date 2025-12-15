require('dotenv').config();
const { Kafka } = require('kafkajs');
const WebSocket = require('ws');

// Configuration
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || 'localhost:9093').split(',');
const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'sensor.raw';
const KAFKA_GROUP_ID = process.env.KAFKA_GROUP_ID || 'fiscal-bridge-group';
const WS_PORT = parseInt(process.env.WS_PORT || '8081');
const NUM_SPOTS = parseInt(process.env.NUM_SPOTS || '10');

// WebSocket server
const wss = new WebSocket.Server({ port: WS_PORT });
const clients = new Set();

// Track spot mapping (sensor id -> spot rotation)
let currentSpotIndex = 0;
const spotIds = Array.from({ length: NUM_SPOTS }, (_, i) => `P${String(i + 1).padStart(3, '0')}`);

// Map to track valid payment sessions per spot
// For demo: randomly assign some spots as having valid sessions
const validSessions = new Map();

/**
 * Simulates whether a spot has a valid payment session
 * For demo purposes: 30% of occupied spots have valid sessions
 */
function hasValidSession(spotId) {
    if (!validSessions.has(spotId)) {
        // Randomly assign: 30% chance of having valid session
        validSessions.set(spotId, Math.random() < 0.3);
    }
    return validSessions.get(spotId);
}

/**
 * Get next spot ID for round-robin distribution
 */
function getNextSpotId() {
    const spotId = spotIds[currentSpotIndex];
    currentSpotIndex = (currentSpotIndex + 1) % spotIds.length;
    return spotId;
}

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
        console.log(`🅿️  Mapping sensor.raw → Spot 1 (Mercado de Braga - Lugar 1)`);

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
                    // Parse Kafka message
                    const rawValue = message.value.toString();
                    const sensorData = JSON.parse(rawValue);

                    console.log(`📨 Received from Kafka: ${rawValue}`);

                    // Extract fields
                    const { ocupado, timestamp } = sensorData;

                    // Map directly to Spot 1 (Lugar 1 - Mercado de Braga)
                    const spotId = "1";

                    // Determine state
                    let state = ocupado ? 'occupied' : 'free';

                    // Check if spot has valid payment session
                    const hasSession = hasValidSession(spotId);

                    // When spot becomes free, reset session status (new car might arrive)
                    if (!ocupado) {
                        validSessions.delete(spotId);
                    }

                    // Create message for frontend
                    const wsMessage = {
                        spotId,
                        state,
                        hasValidSession: hasSession, // Frontend needs this to detect irregularities
                        timestamp: timestamp || new Date().toISOString(),
                        receivedAt: new Date().toISOString()
                    };

                    console.log(`📤 Broadcasting to WebSocket clients: ${JSON.stringify(wsMessage)}`);

                    // Broadcast to all connected clients
                    broadcast(wsMessage);

                } catch (error) {
                    console.error('❌ Error processing Kafka message:', error);
                }
            },
        });

        console.log('✅ Kafka consumer running. Waiting for messages...');
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
