/**
 * Main App Controller
 * Handles login, routing, WebSocket connection, and state management
 */

// Global app state
window.appState = {
    spots: {},           // { spotId: { spotId, rua, lat, lng, state, lastUpdate, hasValidSession } }
    irregularities: {},  // { spotId: { spotId, occupiedSince, duration } }
};

// WebSocket connection
let ws = null;
let wsReconnectTimer = null;

// Router
window.appRouter = {
    currentTab: 'mapa',

    navigateToTab(tabName) {
        this.currentTab = tabName;

        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        // Render appropriate content
        switch (tabName) {
            case 'mapa':
                UI.renderMapTab();
                break;
            case 'irregularidades':
                UI.renderIrregularidadesTab();
                break;
            case 'coimas':
                UI.renderCoimasTab();
                break;
            case 'perfil':
                UI.renderPerfilTab();
                break;
        }
    }
};

/**
 * Initialize WebSocket connection
 */
function initWebSocket() {
    const WS_URL = window.APP_CONFIG?.WS_URL || 'ws://localhost:8081';

    console.log('Connecting to WebSocket:', WS_URL);
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
        console.log('✅ WebSocket connected');
        clearTimeout(wsReconnectTimer);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log('📨 Received from WebSocket:', data);

            // Handle different event types from backend
            handleBackendEvent(data);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };

    ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
    };

    ws.onclose = () => {
        console.warn('⚠️ WebSocket disconnected. Reconnecting in 5s...');
        clearTimeout(wsReconnectTimer);
        wsReconnectTimer = setTimeout(initWebSocket, 5000);
    };
}

/**
 * Handle incoming events from backend WebSocket
 */
function handleBackendEvent(event) {
    const { type } = event;

    switch (type) {
        case 'IRREGULARITY_DETECTED':
            handleIrregularityDetected(event);
            break;

        case 'IRREGULARITIES_UPDATE':
            handleIrregularitiesUpdate(event);
            break;

        case 'FINE_NOTIFICATION':
            handleFineNotification(event);
            break;

        case 'SESSION_CREATED':
        case 'SESSION_EXTENDED':
        case 'SESSION_ENDED':
            handleSessionEvent(event);
            break;

        case 'FINE_CREATED':
        case 'FINE_UPDATED':
            handleFineEvent(event);
            break;

        default:
            console.warn('Unknown event type:', type);
    }
}

/**
 * Handle IRREGULARITY_DETECTED event
 * Real-time infraction from Kafka via bridge
 */
function handleIrregularityDetected(event) {
    const { spotId, occupiedSince, minutesOccupied } = event;

    console.log(`🚨 NEW irregularity detected for spot ${spotId} (${minutesOccupied} minutes occupied)`);

    // Calculate duration from occupied_since timestamp
    const occupiedSinceTimestamp = new Date(occupiedSince).getTime();
    const duration = Date.now() - occupiedSinceTimestamp;

    // Add or update irregularity in state
    window.appState.irregularities[spotId] = {
        spotId,
        occupiedSince: occupiedSinceTimestamp,
        duration
    };

    // Show toast notification
    UI.showToast(`⚠️ Nova Irregularidade: Lugar ${spotId} (${minutesOccupied} min)`, 'error');

    // Update UI if on irregularidades tab
    if (window.appRouter.currentTab === 'irregularidades') {
        UI.renderIrregularidadesTab();
    }
}

/**
 * Handle IRREGULARITIES_UPDATE event
 * Backend sends list of current irregularities
 */
function handleIrregularitiesUpdate(event) {
    const { irregularities } = event;

    console.log(`🚨 Irregularities update: ${irregularities.length} irregular spots`);

    // Clear current irregularities
    window.appState.irregularities = {};

    // Update with backend data
    irregularities.forEach(irreg => {
        window.appState.irregularities[irreg.spot_id] = {
            spotId: irreg.spot_id,
            occupiedSince: Date.now() - (irreg.minutes_occupied * 60000),
            duration: irreg.minutes_occupied * 60000
        };

        // Show toast for new irregularities (>5 min)
        if (irreg.minutes_occupied > 5) {
            UI.showToast(`⚠️ Irregularidade: Lugar ${irreg.spot_id}`, 'error');
        }
    });

    // Update UI if on irregularidades tab
    if (window.appRouter.currentTab === 'irregularidades') {
        UI.renderIrregularidadesTab();
    }
}

/**
 * Handle FINE_NOTIFICATION event
 */
function handleFineNotification(event) {
    const { event: eventType, fine_id, spot_id, amount, message } = event;

    console.log(`💰 Fine notification: ${eventType} for ${spot_id}`);

    // Show toast notification
    UI.showToast(message || `Coima ${fine_id} - ${eventType}`, 'success');

    // If on coimas tab, refresh the list
    if (window.appRouter.currentTab === 'coimas') {
        UI.renderCoimasTab();
    }
}

/**
 * Handle session events (SESSION_CREATED, SESSION_EXTENDED, SESSION_ENDED)
 */
function handleSessionEvent(event) {
    const { type, data } = event;
    const spotId = data?.spot_id;

    if (!spotId) return;

    console.log(`📊 Session event: ${type} for spot ${spotId}`);

    // Update spot if we have it
    if (window.appState.spots[spotId]) {
        // Session created/extended = has valid session now
        if (type === 'SESSION_CREATED' || type === 'SESSION_EXTENDED') {
            window.appState.spots[spotId].hasValidSession = true;

            // Remove from irregularities if present
            if (window.appState.irregularities[spotId]) {
                delete window.appState.irregularities[spotId];
                console.log(`✅ Irregularity resolved for ${spotId} (session created)`);
            }
        }
        // Session ended = no valid session
        else if (type === 'SESSION_ENDED') {
            window.appState.spots[spotId].hasValidSession = false;
        }

        // Update map
        updateSpotOnMap(spotId);
    }
}

/**
 * Handle fine events (FINE_CREATED, FINE_UPDATED)  
 */
function handleFineEvent(event) {
    const { type, data } = event;

    console.log(`📋 Fine event: ${type}`);

    // Just log for now, UI will refresh when tab is opened
    // Could add badge counter here in the future
}

/**
 * Update spot marker on map
 */
function updateSpotOnMap(spotId) {
    const spot = window.appState.spots[spotId];
    if (spot && MapModule.map) {
        MapModule.updateSpotMarker(spot);
    }
}

/**
 * Update irregularity durations
 * Called periodically to keep duration counters up-to-date
 */
function updateIrregularityDurations() {
    const now = Date.now();
    let hasChanges = false;

    Object.keys(window.appState.irregularities).forEach(spotId => {
        const irreg = window.appState.irregularities[spotId];
        const newDuration = now - irreg.occupiedSince;

        if (newDuration !== irreg.duration) {
            irreg.duration = newDuration;
            hasChanges = true;
        }
    });

    // Re-render irregularidades tab if it's active and there are changes
    if (hasChanges && window.appRouter.currentTab === 'irregularidades') {
        UI.renderIrregularidadesTab();
    }
}

/**
 * Load initial spots data from backend
 */
async function loadInitialSpots() {
    try {
        console.log('📡 Loading spots from backend...');

        // Try to load from backend first
        const spots = await API.loadSpots();

        if (spots && spots.length > 0) {
            spots.forEach(spot => {
                window.appState.spots[spot.spotId] = spot;
            });

            console.log(`✅ Loaded ${spots.length} parking spots from backend`);

            // Update map if it's initialized
            if (MapModule.map) {
                Object.values(window.appState.spots).forEach(spot => {
                    MapModule.updateSpotMarker(spot);
                });
            }
        } else {
            console.warn('⚠️ No spots loaded');
        }
    } catch (error) {
        console.error('Error loading spots:', error);
        UI.showToast('Erro ao carregar lugares', 'error');
    }
}



/**
 * Handle login
 */
function handleLogin(event) {
    event.preventDefault();

    const nome = document.getElementById('fiscalNome').value.trim();
    const id = document.getElementById('fiscalId').value.trim();

    if (!nome || !id) {
        UI.showToast('Preencha todos os campos', 'error');
        return;
    }

    // Save to localStorage
    localStorage.setItem('fiscal', JSON.stringify({ nome, id }));

    // Hide login, show app
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('appScreen').classList.remove('hidden');

    // Initialize app
    initApp();
}

/**
 * Initialize main app
 */
function initApp() {
    console.log('🚀 Initializing myTUB Fiscal App');

    // Load spots data
    loadInitialSpots();

    // Setup navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            window.appRouter.navigateToTab(btn.dataset.tab);
        });
    });

    // Navigate to Map tab initially
    window.appRouter.navigateToTab('mapa');

    // Connect to WebSocket for real-time Kafka events
    initWebSocket();

    // Start irregularity duration updater (every 10 seconds)
    setInterval(updateIrregularityDurations, 10000);

    console.log('✅ App initialized - listening for real-time infractions via Kafka');
}

/**
 * Check if user is logged in on page load
 */
window.addEventListener('DOMContentLoaded', () => {
    const fiscal = localStorage.getItem('fiscal');

    if (fiscal) {
        // Already logged in
        document.getElementById('loginScreen').classList.add('hidden');
        document.getElementById('appScreen').classList.remove('hidden');
        initApp();
    } else {
        // Show login screen
        document.getElementById('loginForm').addEventListener('submit', handleLogin);
    }
});
