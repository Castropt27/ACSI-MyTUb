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

function login(name, password) {
    // Accept any credentials for demo purposes (Simple Auth)
    if (name && password) {
        currentClient = {
            id: Date.now().toString(),
            name: name,
            loginAt: new Date().toISOString()
        };
        localStorage.setItem("currentClient", JSON.stringify(currentClient));
        showAppScreen();
        return true;
    }
    return false;
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
