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
    const WS_URL = 'ws://localhost:8081';

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

            handleSensorEvent(data);
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
 * Handle incoming sensor event from WebSocket
 */
function handleSensorEvent(event) {
    const { spotId, state, hasValidSession, timestamp } = event;

    // Find or create spot
    if (!window.appState.spots[spotId]) {
        // Load spot details from sample data
        fetch('spots.sample.json')
            .then(res => res.json())
            .then(spots => {
                const spotData = spots.find(s => s.spotId === spotId);
                if (spotData) {
                    window.appState.spots[spotId] = {
                        ...spotData,
                        state,
                        hasValidSession,
                        lastUpdate: timestamp
                    };
                    updateSpotOnMap(spotId);
                }
            })
            .catch(err => console.error('Error loading spots:', err));
    } else {
        // Update existing spot
        window.appState.spots[spotId].state = state;
        window.appState.spots[spotId].hasValidSession = hasValidSession;
        window.appState.spots[spotId].lastUpdate = timestamp;
        updateSpotOnMap(spotId);
    }

    // Handle irregularity detection
    handleIrregularityDetection(spotId, state, hasValidSession, timestamp);
}

/**
 * Detect and track irregularities
 * LOGIC: Spot is irregular when occupied WITHOUT valid session for >5 min
 */
function handleIrregularityDetection(spotId, state, hasValidSession, timestamp) {
    const now = new Date(timestamp).getTime();

    if (state === 'occupied' && !hasValidSession) {
        // Spot is occupied without payment

        if (!window.appState.irregularities[spotId]) {
            // Start tracking this irregularity
            window.appState.irregularities[spotId] = {
                spotId,
                occupiedSince: now,
                duration: 0
            };
            console.log(`🚨 Tracking irregularity for ${spotId}`);
        }
    } else {
        // Spot is free OR has valid session
        // Remove irregularity if it exists
        if (window.appState.irregularities[spotId]) {
            console.log(`✅ Irregularity resolved for ${spotId}`);
            delete window.appState.irregularities[spotId];
        }
    }

    // Update durations for all irregularities
    updateIrregularityDurations();
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
 * Load initial spots data
 */
async function loadInitialSpots() {
    try {
        const response = await fetch('spots.sample.json');
        const spots = await response.json();

        spots.forEach(spot => {
            window.appState.spots[spot.spotId] = {
                ...spot,
                state: 'unknown',
                hasValidSession: false,
                lastUpdate: null
            };
        });

        console.log(`✅ Loaded ${spots.length} parking spots`);

        // Update map if it's initialized
        if (MapModule.map) {
            Object.values(window.appState.spots).forEach(spot => {
                MapModule.updateSpotMarker(spot);
            });
        }
    } catch (error) {
        console.error('Error loading spots:', error);
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

    // Connect to WebSocket
    initWebSocket();

    // Start irregularity duration updater (every 10 seconds)
    setInterval(updateIrregularityDurations, 10000);

    console.log('✅ App initialized');
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
