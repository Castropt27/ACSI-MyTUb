/**
 * INSTRUÇÕES: 
 * 1. Adiciona esta função DEPOIS da função loadInitialSpots() (linha ~272)
 * 2. Depois atualiza a função initApp() com o setInterval (ver linha 47)
 */

// ============================================================
// PASSO 1: Adicionar esta função após loadInitialSpots()
// ============================================================

/**
 * Poll irregularities from backend
 * This triggers backend to broadcast via WebSocket AND updates local state
 */
async function pollIrregularities() {
    try {
        console.log('🔍 Polling irregularities from backend...');
        const irregularities = await API.loadIrregularities();

        if (irregularities !== null) {
            // Track new irregularities
            const previousIds = new Set(Object.keys(window.appState.irregularities));

            // Update state directly from polling (in case WebSocket fails)
            window.appState.irregularities = {};

            irregularities.forEach(irreg => {
                window.appState.irregularities[irreg.spotId] = {
                    spotId: irreg.spotId,
                    occupiedSince: irreg.occupiedSince,
                    duration: irreg.duration
                };

                // Show toast only for NEW irregularities
                if (!previousIds.has(irreg.spotId)) {
                    console.log(`🚨 NEW irregularity detected for spot ${irreg.spotId}`);
                    UI.showToast(`⚠️ Irregularidade: Lugar ${irreg.spotId}`, 'error');
                }
            });

            console.log(`📊 Irregularities: ${irregularities.length} spots`);

            // Update UI if on irregularidades tab
            if (window.appRouter.currentTab === 'irregularidades') {
                UI.renderIrregularidadesTab();
            }
        } else {
            console.log('ℹ️ No irregularities data from backend');
        }
    } catch (error) {
        console.error('❌ Error polling irregularities:', error);
    }
}

// ============================================================
// PASSO 2: Na função initApp(), DEPOIS de initWebSocket(), adiciona:
// ============================================================

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

    // ⭐ ADICIONA ESTAS 3 LINHAS AQUI ⭐
    console.log('⏰ Starting irregularities polling every 5 seconds');
    pollIrregularities(); // First call immediately
    setInterval(pollIrregularities, 5000); // Poll every 5 seconds

    // Start irregularity duration updater (every 10 seconds)
    setInterval(updateIrregularityDurations, 10000);

    console.log('✅ App initialized');
}

// ============================================================
// PROBLEMA ADICIONAL: Coordenadas GPS
// ============================================================

/**
 * No PC2, precisa executar este SQL para adicionar coordenadas:
 * 
 * docker exec -it postgres-db psql -U backend -d sensor_data
 * 
 * UPDATE sensor_readings
 * SET gps_lat = 41.55387812968043,
 *     gps_lng = -8.427430784131518,
 *     rua = 'Mercado de Braga - Lugar 1',
 *     zone = 'mercado'
 * WHERE sensor_id = '1';
 * 
 * SELECT sensor_id, gps_lat, gps_lng FROM sensor_readings WHERE sensor_id = '1';
 */
