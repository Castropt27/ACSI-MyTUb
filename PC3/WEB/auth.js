// ==================== AUTHENTICATION MODULE ====================

// Declare globals that auth manages
let currentClient = null;

function showLoginScreen() {
    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");
    if (loginScreen) loginScreen.classList.remove("hidden");
    if (appScreen) appScreen.classList.add("hidden");
}

function showAppScreen() {
    const loginScreen = document.getElementById("loginScreen");
    const appScreen = document.getElementById("appScreen");

    // Hide all internal panels to ensure we start at the Map
    const screens = ["account-screen", "payment-screen", "place-panel", "payment-method-modal"];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });

    if (loginScreen) loginScreen.classList.add("hidden");
    if (appScreen) appScreen.classList.remove("hidden");

    // Initialize map when app screen is shown (assuming MapModule is globally available)
    if (typeof MapModule !== 'undefined' && !MapModule.getMap()) {
        setTimeout(() => {
            MapModule.init('map');
            if (typeof atualizarMapa === 'function') {
                atualizarMapa();
            }
        }, 100);
    }
}

function checkSession() {
    const client = localStorage.getItem("currentClient");
    if (client) {
        try {
            currentClient = JSON.parse(client);
            showAppScreen();
            return true;
        } catch (e) {
            localStorage.removeItem("currentClient");
        }
    }
    showLoginScreen();
    return false;
}

async function login(username, password) {
    if (!username || !password) return false;

    // The Backend API (PC2) does not have a /auth/login endpoint.
    // We simulate login here, but we can check if backend is reachable.

    try {
        // Optional: Check if backend is alive
        const healthCheck = await fetch(`${Config.API_BASE_URL.replace('/api', '')}/health`);
        // Note: URL structure assumes /health is at root or config base? 
        // config.js has API_BASE_URL = ...:8000/api
        // backend_api.py has @app.get("/health") at root?
        // Wait, FastAPI defaults. usually root /health or /api/health depending on router.
        // backend_api.py lines 180: @app.get("/health"). It's at ROOT level if app is not mounted under /api.
        // But app definition is simple FastAPI(). 
        // So it is likely http://IP:8000/health.config.js has /api.
    } catch (e) {
        console.warn("Backend connectivity check failed", e);
    }

    // Simulate Success for Demo
    currentClient = {
        id: Date.now().toString(),
        name: username,
        loginAt: new Date().toISOString()
    };
    localStorage.setItem("currentClient", JSON.stringify(currentClient));
    showAppScreen();
    return true;
}

function logout() {
    currentClient = null;
    localStorage.removeItem("currentClient");
    showLoginScreen();

    // Reset form
    const loginForm = document.getElementById("loginForm");
    if (loginForm) loginForm.reset();
}

// Export functions for global usage if needed, or just keep them in global scope for this simple app structure
window.AuthModule = {
    checkSession,
    login,
    logout,
    getSession: () => currentClient
};
