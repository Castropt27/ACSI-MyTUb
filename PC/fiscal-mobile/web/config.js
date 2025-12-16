/**
 * Configuration for myTUB Fiscal Mobile App
 */

const CONFIG = {
    // Backend API (PC2)
    BACKEND_URL: 'http://192.168.21.17:8000',

    // WebSocket (Bridge Server - Kafka Consumer)
    WS_URL: 'ws://localhost:8081',

    // Default fine amount
    DEFAULT_FINE_AMOUNT: 50.00
};

// Make config globally available
window.APP_CONFIG = CONFIG;
