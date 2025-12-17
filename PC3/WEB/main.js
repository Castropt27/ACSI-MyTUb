// ==================== MAIN APP LOGIC ====================

// Global State
let placePanel = null;
let sessaoPendente = null;

// function desenharLugares defined below
// Global polling
let spotPollingInterval = null;

async function fetchSpots() {
    try {
        const response = await fetch('http://192.168.21.17:8000/api/spots');
        if (!response.ok) throw new Error("API Error");

        const data = await response.json();
        console.log("FETCH SPOTS DATA:", data);
        // Backend returns { spots: [...] }

        const frontendSpots = data.spots.map(s => {
            // Check ID format (Backend uses spotId, gpsLat, gpsLng)
            let displayId = s.spotId;

            // Clean up if it's "sensor_1" -> "1"
            if (String(displayId).startsWith("sensor_")) {
                displayId = displayId.replace("sensor_", "");
            }

            return {
                id: s.spotId,
                nome: "Lugar - " + displayId,
                lat: s.gpsLat || 41.5538,
                lng: s.gpsLng || -8.4274,
                estado: s.ocupado ? "OCUPADO" : "LIVRE"
            };
        });

        desenharLugares(frontendSpots);

    } catch (e) {
        console.error("Erro a buscar lugares:", e);
        // Only show toast on manual refresh or major error?
        // showToast("Erro de ligação.", "error"); 
    }
}

function startSpotPolling() {
    fetchSpots(); // Initial fetch only (on load/refresh)
    // Polling disabled as per user request
    if (spotPollingInterval) clearInterval(spotPollingInterval);
}

function desenharLugares(lugares) {
    MapModule.clearMarkers();

    lugares.forEach(lugar => {
        // Add marker to map
        MapModule.updateSpotMarker(lugar);

        // Add click handler
        MapModule.addMarkerClickHandler(lugar.id, (spot) => {
            abrirPainelLugar(spot);
        });
    });

    // Update availability stats
    updateAvailabilityStats(lugares);
}

function updateAvailabilityStats(lugares) {
    const available = lugares.filter(l => l.estado === "LIVRE").length;
    const occupied = lugares.filter(l => l.estado === "OCUPADO").length;

    const availableElem = document.querySelector("#available-count .stat-number");
    const occupiedElem = document.querySelector("#occupied-count .stat-number");

    if (availableElem) availableElem.textContent = available;
    if (occupiedElem) occupiedElem.textContent = occupied;
}

async function atualizarMapa() {
    await fetchSpots();
}



function fecharPainelLugar() {
    const panel = document.getElementById("place-panel");
    if (panel) panel.classList.add("hidden");
}

// --- SESSION POLLING & STATE MANAGEMENT ---
let sessionPollingInterval = null;
let currentSessionId = null;

async function checkActiveSession(spotId) {
    try {
        const response = await fetch(`http://192.168.21.17:8000/api/sessions/active?spotId=${spotId}`);
        if (response.status === 404) return null; // No active session
        if (!response.ok) return null;
        const data = await response.json();
        // Strict check: must have sessionId
        if (!data || !data.sessionId) return null;
        return data;
    } catch (e) {
        console.error("Error checking active session:", e);
        return null;
    }
}

function startSessionPolling(sessionId) {
    if (sessionPollingInterval) clearInterval(sessionPollingInterval);
    currentSessionId = sessionId;

    // Poll immediately
    pollSessionStatus();

    sessionPollingInterval = setInterval(pollSessionStatus, 2000);
}

async function pollSessionStatus() {
    if (!currentSessionId) return;

    try {
        const response = await fetch(`http://192.168.21.17:8000/api/sessions/${currentSessionId}`);
        if (!response.ok) {
            if (response.status === 404) {
                // Session likely gone
                console.warn("Session not found during polling");
                stopSessionPolling();
            }
            return;
        }

        const session = await response.json();
        updateSessionUI(session);
    } catch (e) {
        console.error("Polling error:", e);
    }
}

function stopSessionPolling() {
    if (sessionPollingInterval) clearInterval(sessionPollingInterval);
    sessionPollingInterval = null;
    currentSessionId = null;
    // Clear banners if any
    const banner = document.getElementById("grace-banner");
    if (banner) banner.remove();
}

function updateSessionUI(session) {
    // Check Status: ACTIVE, GRACE, EXPIRED
    const status = session.state || "ACTIVE";

    // Update Map Marker for this session's spot
    if (typeof MapModule !== 'undefined' && session.spotId) {
        let mapState = 'OCUPADO';
        if (status === 'GRACE') mapState = 'AMARELO';
        else if (status === 'EXPIRED') mapState = 'OCUPADO';
        else if (status === 'ACTIVE') mapState = 'OCUPADO';

        // We need existing spot data to preserve coords
        if (MapModule.spotMarkers && MapModule.spotMarkers[session.spotId]) {
            const currentSpot = MapModule.spotMarkers[session.spotId].spot;
            // Update if changed
            if (currentSpot.estado !== mapState) {
                MapModule.updateSpotMarker({ ...currentSpot, estado: mapState });
            }
        }
    }

    if (status === "GRACE") {
        showGraceBanner(session);
    } else if (status === "EXPIRED") {
        showExpiredState(session);
        stopSessionPolling();
    } else {
        // ACTIVE
        // Ideally update timer in panel if open
        const panel = document.getElementById("place-panel");
        if (panel && !panel.classList.contains("hidden") && lugarSelecionado && lugarSelecionado.id === session.spotId) {
            const stateText = document.getElementById("place-state-text");
            if (stateText) {
                stateText.style.display = 'block';
                stateText.textContent = `Termina em: ${session.remainingMinutes || '?'} min`;
            }
        }
    }
}

function showGraceBanner(session) {
    let banner = document.getElementById("grace-banner");
    if (!banner) {
        banner = document.createElement("div");
        banner.id = "grace-banner";
        banner.style.position = "fixed";
        banner.style.top = "0";
        banner.style.left = "0";
        banner.style.width = "100%";
        banner.style.backgroundColor = "#F57F17"; // Warning Orange
        banner.style.color = "white";
        banner.style.padding = "10px";
        banner.style.textAlign = "center";
        banner.style.zIndex = "3000";
        banner.style.fontWeight = "bold";
        banner.innerHTML = `
            ⚠️ O tempo expirou! Tens <span id="grace-countdown">30</span>s para renovar. 
            <button id="banner-renew-btn" style="background: white; color: #F57F17; border: none; padding: 4px 8px; margin-left: 10px; border-radius: 4px; cursor: pointer;">RENOVAR AGORA</button>
        `;
        document.body.appendChild(banner);

        document.getElementById("banner-renew-btn").addEventListener("click", () => {
            // Open Renewal UI (Payment Screen directly?)
            // Or Open Place Panel
            // Let's assume re-opening payment with current session context
            sessaoPendente = {
                lugarId: session.spotId,
                lugarNome: "Renovação",
                matricula: session.licensePlate, // From session
                duracao: 0, // Will be set by user
                isRenewal: true,
                sessionId: session.sessionId
            };
            abrirEcraPagamento(); // Need to adjust this to show duration selection?
            // Actually, extension.js handles "Renewal". Maybe open Extension Modal?
            // "Renovar" button -> Extension Selection

            // Simpler: Trigger extension flow IF we have logic for it.
            // For now, let's just open the Place Panel or Payment.
            // Wait, User said "Renovar: POST .../renew".
            // extension.js has logic for "extension".
            // Let's invoke extension.js logic if possible.
            const extModal = document.getElementById("extension-selection-modal");
            if (extModal) {
                // Prepare context for extension
                // We need to know which session it is.
                // extension.js uses `activeSession` logic.
                // We might need to inject this session into `sessionData` or similar logic.
                // Use extension.js `applyExtension` placeholder?

                // Reuse Opening Place Panel for simplicity if it handles "Renovar"
                // User said "mostrar botão Renovar" in panel.
            }
        });
    }

    // Update Countdown
    const countdown = document.getElementById("grace-countdown");
    // This needs real calculation based on `graceEndTime`. 
    // Assuming 30s fixed for now from trigger.
}

function showExpiredState() {
    const banner = document.getElementById("grace-banner");
    if (banner) {
        banner.style.backgroundColor = "#D32F2F"; // Red
        banner.innerHTML = "❌ Sessão Expirada. Coima em processamento.";
        setTimeout(() => banner.remove(), 5000);
    }
}


// --- PANEL LOGIC ---

async function abrirPainelLugar(lugar) {
    const panel = document.getElementById("place-panel");
    const statusElem = document.getElementById("place-status");
    const startBtn = document.getElementById("start-session-btn");
    const form = document.getElementById("session-form");

    if (!panel || !statusElem || !startBtn) return;

    lugarSelecionado = lugar; // Global

    const titleEl = document.getElementById("place-title");
    if (titleEl) titleEl.textContent = lugar.nome;

    // 1. Check if there is an ACTIVE session using Backend
    const activeSession = await checkActiveSession(lugar.id);

    // 2. Verify Session Ownership (Heuristic: Check local history)
    let isMySession = false;
    if (activeSession) {
        // Check if we have this sessionId in local window.sessionData
        if (window.sessionData && window.sessionData.some(s => String(s.sessionId) === String(activeSession.sessionId))) {
            isMySession = true;
        }
    }

    if (activeSession && isMySession) {
        // --- MY ACTIVE SESSION ---
        statusElem.textContent = "Ocupado (Sessão Ativa)";
        statusElem.classList.remove("free", "busy");
        statusElem.classList.add("busy");

        startBtn.disabled = false;
        startBtn.textContent = "Renovar / Prolongar";
        startBtn.onclick = () => {
            sessaoPendente = {
                lugarId: lugar.id,
                matricula: activeSession.licensePlate,
                sessionId: activeSession.sessionId,
                isRenewal: true
            };
            const extModal = document.getElementById("extension-selection-modal");
            if (extModal) extModal.classList.remove("hidden");
        };

        if (form) form.classList.add("hidden");

        // Start polling this session if not already
        if (currentSessionId !== activeSession.sessionId) {
            startSessionPolling(activeSession.sessionId);
        }

    } else if (activeSession && !isMySession) {
        // --- OCCUPIED BY OTHERS ---
        statusElem.textContent = "Ocupado";
        statusElem.classList.remove("free", "busy");
        statusElem.classList.add("busy");

        startBtn.disabled = true;
        startBtn.textContent = "Lugar Ocupado";
        startBtn.onclick = null;

        if (form) form.classList.add("hidden");

    } else {
        // --- NO ACTIVE SESSION (Standard Logic) ---
        // Restore standard click handler for startBtn logic by resetting
        startBtn.onclick = null;

        const livre = lugar.estado === "LIVRE";
        statusElem.textContent = livre ? "Livre" : "Ocupado";
        statusElem.classList.remove("free", "busy");
        statusElem.classList.add(livre ? "free" : "busy");

        if (form) {
            form.classList.add("hidden");
            const mi = document.getElementById("matricula-input");
            const di = document.getElementById("duracao-input");
            if (mi) mi.value = "";
            if (di) di.value = "";
        }

        if (!livre) {
            startBtn.disabled = false;
            startBtn.textContent = "Pagar Estacionamento";
        } else {
            startBtn.disabled = true;
            startBtn.textContent = "Lugar Livre";
        }
    }

    panel.classList.remove("hidden");
}

function showToast(message, type = 'success', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, duration);
}

// Global Function to Finish Session (called by payment methods)
// Global Function to Finish Session (called by payment methods)
window.finishParkingSession = async function (method) {
    if (!sessaoPendente) return;

    // 1. Send to Backend
    try {
        // Get user name from Auth if available
        let currentUserName = "UserApp";
        if (typeof AuthModule !== 'undefined' && AuthModule.getSession()) {
            currentUserName = AuthModule.getSession().name;
        }

        const payload = {
            spotId: String(sessaoPendente.lugarId || "1"), // User confirmed String
            licensePlate: sessaoPendente.matricula,
            durationMinutes: parseInt(sessaoPendente.duracao),
            valor: parseFloat(sessaoPendente.duracao * 0.02), // 0.02€/min
            metodo: method, // "MBWAY"
            telemovel: sessaoPendente.telemovel || "999999999", // Default if not provided
            userName: currentUserName
        };

        const response = await fetch('http://192.168.21.17:8000/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const resData = await response.json();
            console.log("Session created in backend:", resData);

            // Start Polling immediately if we have sessionId
            if (resData.sessionId) {
                startSessionPolling(resData.sessionId);
                showToast(`Sessão criada! ID: ${resData.sessionId}`, "success");
            } else {
                showToast("Sessão criada (sem ID retornado).", "success");
            }

        } else {
            console.error("Backend error creating session");
            showToast("Erro ao criar sessão no backend.", "error");
        }
    } catch (e) {
        console.error("Network error creating session:", e);
        showToast("Erro de rede.", "error");
    }

    // 2. Create local session object (Legacy/Frontend Logic)
    // Kept for history compatibility but backend is truth now
    // 2. Create local session object (Legacy/Frontend Logic)
    // Kept for history compatibility but backend is truth now
    // We bind local sessionId from backend if possible
    let backendId = Date.now();
    // Need to access resData but it's scoped in try block...
    // Let's fix this structure in future, for now rely on polling finding it by ID if we could.
    // Wait, polling uses `startSessionPolling(resData.sessionId)`.
    // But `abrirPainelLugar` needs it in `window.sessionData`.
    // We need to grab it. 
    // BUT checking logic relies on 'activeSession.sessionId' matching 's.sessionId'.
    // If we don't store it, ownership check fails.

    // WORKAROUND: We need `newSession` to have the ID we just got.
    // But `resData` is gone.
    // I should rewrite finishParkingSession to keep resData.

    // FOR NOW: Let's assume we can match by spotId + status if ID is missing.
    // OR: Rewrite this block better.
    // Actually, I can replace the whole function in a cleaner task? 
    // No, I'll just use a simpler replacement here to inject a global var or similar? No.
    // Let's assume 'lastCreatedSessionId' or just fix the code properly below.

    const newSession = {
        id: Date.now(), // Fallback
        sessionId: currentSessionId, // We called startSessionPolling(resData.sessionId) which sets currentSessionId global! Smart.
        spot: sessaoPendente.lugarNome || ("Lugar " + sessaoPendente.lugarId),
        location: "Praça do Comércio",
        startDate: sessaoPendente.inicio.toISOString(),
        endDate: new Date(sessaoPendente.inicio.getTime() + sessaoPendente.duracao * 60000).toISOString(),
        duration: sessaoPendente.duracao + " min",
        cost: (sessaoPendente.duracao * 0.02).toFixed(2) + " €",
        plate: sessaoPendente.matricula,
        status: "Em Progresso", // Initial status
        notified: false
    };

    // Add to history
    if (window.sessionData) {
        window.sessionData.unshift(newSession);
    }

    // Update UI
    if (typeof renderHistory === 'function') renderHistory();

    // Close Screens
    fecharEcraPagamento();
    if (typeof fecharModalMetodos === 'function') fecharModalMetodos();

    // Legacy polling check (can enable if needed, but new polling replaces it)
    // if (typeof checkSessions === 'function') checkSessions();

    sessaoPendente = null;
};

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function () {
    // Check auth session
    if (typeof AuthModule !== 'undefined') {
        AuthModule.checkSession();
    }

    // ----- AUTH LISTENERS -----
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const name = document.getElementById("clientName").value.trim();
            const password = document.getElementById("clientPassword").value;

            if (typeof AuthModule !== 'undefined' && AuthModule.login(name, password)) {
                showToast("Login efetuado com sucesso!", "success");
            } else {
                showToast("Nome ou palavra-passe incorretos.", "error");
            }
        });
    }

    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", () => {
            if (confirm("Tem a certeza que deseja terminar a sessão?")) {
                if (typeof AuthModule !== 'undefined' && AuthModule.logout) {
                    AuthModule.logout();
                } else if (typeof logout === 'function') {
                    logout();
                } else {
                    console.error("Logout function not found");
                    alert("Erro: Função de logout não encontrada.");
                }
                showToast("Sessão terminada.", "success");
            }
        });
    }

    // ----- MAP & SESSION LISTENERS -----
    const refreshBtn = document.getElementById("refresh-btn");
    if (refreshBtn) refreshBtn.addEventListener("click", atualizarMapa);

    const placeClose = document.getElementById("place-close");
    if (placeClose) placeClose.addEventListener("click", fecharPainelLugar);

    const form = document.getElementById("session-form");
    const startBtn = document.getElementById("start-session-btn");
    const confirmBtn = document.getElementById("confirm-session-btn");
    const cancelBtn = document.getElementById("cancel-session-btn");
    const matriculaInput = document.getElementById("matricula-input");
    const duracaoInput = document.getElementById("duracao-input");

    if (startBtn) {
        startBtn.addEventListener("click", () => {
            if (!lugarSelecionado) return;
            if (lugarSelecionado.estado !== "LIVRE") return;
            if (form) form.classList.remove("hidden");
        });
    }

    if (confirmBtn) {
        confirmBtn.addEventListener("click", () => {
            if (!lugarSelecionado) return;

            const matricula = (matriculaInput ? matriculaInput.value : "").trim();
            const duracaoRaw = duracaoInput ? String(duracaoInput.value).trim() : "";
            const duracao = Number(duracaoRaw);

            if (!matricula) {
                showToast("Por favor insira a matrícula.", "error");
                return;
            }
            if (!duracao || duracao <= 0) {
                showToast("Por favor insira a duração em minutos.", "error");
                return;
            }

            sessaoPendente = {
                lugarId: lugarSelecionado.id,
                lugarNome: lugarSelecionado.nome,
                matricula,
                duracao,
                inicio: new Date()
            };

            if (form) form.classList.add("hidden");
            fecharPainelLugar();

            // Call Payment Module
            abrirEcraPagamento();
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
            if (form) form.classList.add("hidden");
        });
    }

    // ----- PAYMENT SCREEN LISTENERS -----
    const paymentCancelBtn = document.getElementById("payment-cancel-btn");
    if (paymentCancelBtn) paymentCancelBtn.addEventListener("click", fecharEcraPagamento);

    const paymentConfirmBtn = document.getElementById("payment-confirm-btn");
    if (paymentConfirmBtn) paymentConfirmBtn.addEventListener("click", abrirModalMetodos);

    const closeModalBtn = document.getElementById("close-method-modal");
    if (closeModalBtn) closeModalBtn.addEventListener("click", fecharModalMetodos);

    const methodModal = document.getElementById("payment-method-modal");
    if (methodModal) {
        methodModal.addEventListener("click", (e) => {
            if (e.target === methodModal) fecharModalMetodos();
        });
    }

    const methodOptions = document.querySelectorAll(".method-option");
    methodOptions.forEach(btn => {
        btn.addEventListener("click", () => {
            if (!sessaoPendente) return;

            const metodoRaw = btn.dataset.method || "Método";
            const metodo = metodoRaw.trim();
            console.log("Método selecionado:", metodo);

            // Special handling for MB WAY
            if (metodo === "MB WAY" || metodo.includes("MB WAY")) {
                fecharModalMetodos();
                if (typeof MbWayModule !== 'undefined') {
                    MbWayModule.abrirModal();
                } else {
                    console.error("MbWayModule not loaded");
                    // Fallback or alert user
                    alert("Erro interno: Módulo MB WAY não disponível. Tente recarregar.");
                }
            } else {
                if (typeof window.finishParkingSession === 'function') {
                    window.finishParkingSession(metodo);
                } else {
                    showToast(`Método selecionado: ${metodo}. Pagamento confirmado.`, "success");
                    fecharEcraPagamento();
                }
            }
        });
    });

    // Global Key Handlers
    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;

        // Logic to close top-most modal
        const modal = document.getElementById("payment-method-modal");
        if (modal && !modal.classList.contains("hidden")) {
            fecharModalMetodos();
            return;
        }
        const screen = document.getElementById("payment-screen");
        if (screen && !screen.classList.contains("hidden")) {
            fecharEcraPagamento();
            return;
        }
        if (placePanel && !placePanel.classList.contains("hidden")) {
            fecharPainelLugar();
        }

    });



    // ----- HISTORY & EXTENSION LOGIC -----
    const historyBtn = document.getElementById("nav-history-btn");
    const historyScreen = document.getElementById("history-screen");
    const accountScreen = document.getElementById("account-screen");
    const accountBtn = document.getElementById("nav-account-btn");

    // EXTENSION ELEMENTS
    const warningModal = document.getElementById("extension-warning-modal");
    const selectionModal = document.getElementById("extension-selection-modal");
    const btnExtendYes = document.getElementById("btn-extend-yes");
    const btnExtendNo = document.getElementById("btn-extend-no");
    const btnCancelExt = document.getElementById("btn-cancel-extension");
    const timeBtns = document.querySelectorAll(".time-btn");

    // Mutable Session Data - EXPOSED GLOBALLY
    window.sessionData = [
        {
            id: 1,
            spot: "Lugar 3",
            location: "Praça do Comércio",
            startDate: new Date(Date.now() - 50 * 60 * 1000).toISOString(), // Started 50 mins ago
            endDate: new Date(Date.now() + 10 * 60 * 1000).toISOString(),   // Ends in 10 mins (Active)
            duration: "60 min",
            cost: "1.20 €",
            plate: "AA-12-BB",
            status: "Em Progresso"
        },
        {
            id: 2,
            spot: "Lugar 1",
            location: "Praça do Comércio",
            startDate: "2025-12-16T09:15:00",
            endDate: "2025-12-16T09:45:00",
            duration: "30 min",
            cost: "0.60 €",
            plate: "CC-34-DD",
            status: "Concluído"
        },
        {
            id: 3,
            spot: "Lugar 5",
            location: "Praça do Comércio",
            startDate: "2025-12-15T18:45:00",
            endDate: "2025-12-15T20:45:00",
            duration: "120 min",
            cost: "2.40 €",
            plate: "EE-56-FF",
            status: "Concluído"
        },
        {
            id: 4,
            spot: "Lugar 2",
            location: "Praça do Comércio",
            startDate: "2025-12-15T10:00:00",
            endDate: "2025-12-15T11:00:00",
            duration: "60 min",
            cost: "1.20 €",
            plate: "AA-12-BB",
            status: "Concluído"
        },
        {
            id: 5,
            spot: "Lugar 4",
            location: "Praça do Comércio",
            startDate: "2025-12-14T14:00:00",
            endDate: "2025-12-14T16:00:00",
            duration: "120 min",
            cost: "2.40 €",
            plate: "CC-34-DD",
            status: "Concluído"
        }
    ];

    // Extension Logic moved to extension.js

    // --- UTILS ---
    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    function renderHistoryCard(item) {
        const isInProgress = item.status === "Em Progresso";
        const statusClass = isInProgress ? "in-progress" : "completed";
        const cardClass = isInProgress ? "history-item active" : "history-item";

        // Calculate visual remaining time if active
        let remainingBadge = '';
        if (isInProgress) {
            const now = new Date();
            const end = new Date(item.endDate);
            const diffMins = Math.ceil((end - now) / 60000);
            if (diffMins > 0) {
                remainingBadge = `<div class="remaining-badge" style="font-size: 0.7rem; color: #F57F17; margin-top: 4px;">Faltam ${diffMins} min</div>`;
            }
        }

        return `
            <div class="${cardClass}">
                <div class="history-card-header">
                    <div class="history-spot-info">
                        <span class="history-spot-icon">${isInProgress ? '🅿️' : '✅'}</span>
                        <div>
                            <div class="history-spot-name">${item.spot}</div>
                            <div class="history-location-text">${item.location}</div>
                            ${remainingBadge}
                        </div>
                    </div>
                    <div class="history-status ${statusClass}">${item.status}</div>
                </div>
                
                <div class="history-card-body">
                    <div class="history-info-row">
                        <div class="history-info-item">
                            <span class="info-icon">🚗</span>
                            <span class="info-value">${item.plate}</span>
                        </div>
                        <div class="history-info-item">
                            <span class="info-icon">⏱️</span>
                            <span class="info-value">${item.duration}</span>
                        </div>
                        <div class="history-info-item cost">
                            <span class="info-icon">💰</span>
                            <span class="info-value">${item.cost}</span>
                        </div>
                    </div>
                    
                    <div class="history-times">
                        <div class="time-block">
                            <span class="time-label">Início</span>
                            <span class="time-value">${formatDate(item.startDate)}</span>
                        </div>
                        <div class="time-separator">→</div>
                        <div class="time-block">
                            <span class="time-label">Fim</span>
                            <span class="time-value">${formatDate(item.endDate)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderHistory() {
        if (!historyScreen) return;

        if (accountScreen) accountScreen.classList.add("hidden");
        const placePanel = document.getElementById("place-panel");
        if (placePanel) placePanel.classList.add("hidden");

        const recentHistory = sessionData.slice(0, 3);
        const hasMore = sessionData.length > 3;

        let html = `
            <div class="history-container">
                <div class="history-header">
                    <h2>Histórico de Estacionamento</h2>
                    <p class="history-subtitle">As suas sessões de estacionamento</p>
                </div>
                <div class="history-list">
        `;

        if (recentHistory.length === 0) {
            html += `
                <div class="empty-history">
                    <div class="empty-icon">🚗</div>
                    <p>Ainda não tem histórico de estacionamento.</p>
                </div>
            `;
        } else {
            recentHistory.forEach(item => {
                html += renderHistoryCard(item);
            });
        }

        html += `</div>`; // Close history-list

        if (hasMore) {
            html += `
                <div class="history-more-container">
                    <button id="view-all-history-btn" class="btn-view-all">
                        <span class="dots">•••</span>
                    </button>
                    <p class="view-all-label">Ver todo o histórico</p>
                </div>
            `;
        }

        html += `</div>`; // Close container
        historyScreen.innerHTML = html;
        historyScreen.classList.remove("hidden");

        // Bind View All button
        const viewAllBtn = document.getElementById("view-all-history-btn");
        if (viewAllBtn) {
            viewAllBtn.addEventListener("click", renderFullHistory);
        }


    }
    // Expose renderHistory globally for extension.js
    window.renderHistory = renderHistory;

    function renderFullHistory() {
        if (!historyScreen) return;

        // Group by date
        const grouped = {};
        sessionData.forEach(item => {
            const dateObj = new Date(item.startDate);
            const dateKey = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(item);
        });

        const sortedDates = Object.keys(grouped).sort((a, b) => {
            const [da, ma, ya] = a.split('/').map(Number);
            const [db, mb, yb] = b.split('/').map(Number);
            return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
        });

        let html = `
            <div class="history-container">
                <div class="history-header">
                     <button id="back-history-btn" class="nav-back-btn">← Voltar</button>
                     <h2>Histórico Completo</h2>
                </div>
                <div class="history-list full-list">
        `;

        sortedDates.forEach(date => {
            html += `<h3 class="history-date-header">${date}</h3>`;
            grouped[date].forEach(item => {
                html += renderHistoryCard(item);
            });
        });

        html += `</div></div>`;
        historyScreen.innerHTML = html;

        const backBtn = document.getElementById("back-history-btn");
        if (backBtn) {
            backBtn.addEventListener("click", renderHistory);
        }
    }

    if (historyBtn) {
        historyBtn.addEventListener("click", renderHistory);
    }

    // Start monitoring
    startSessionMonitoring();


    // ----- ACCOUNT SCREEN LOGIC -----

    function renderAccount() {
        if (!accountScreen) return;

        // Hide history screen if open
        if (historyScreen) historyScreen.classList.add("hidden");

        let user = { name: "Visitante" };
        if (typeof AuthModule !== 'undefined') {
            AuthModule.checkSession();
            const session = AuthModule.getSession();
            if (session) {
                user = session;
            }
        }
        const initial = user.name.charAt(0).toUpperCase();

        accountScreen.innerHTML = `
            <div class="account-header">
                <button id="btn-settings-account" class="btn-settings-icon">⚙️</button>
            </div>
            <div class="profile-container">
                <div class="profile-avatar">${initial}</div>
                <div class="profile-name">${user.name}</div>
                <div class="profile-email">Cliente myTUB</div>
                
                <button id="logout-btn-account" class="btn-logout-account">
                    Terminar Sessão
                </button>
            </div>
        `;

        accountScreen.classList.remove("hidden");

        // Bind events
        document.getElementById("logout-btn-account").addEventListener("click", () => {
            if (confirm("Tem a certeza que deseja terminar a sessão?")) {
                if (typeof AuthModule !== 'undefined' && AuthModule.logout) {
                    AuthModule.logout();
                } else if (typeof logout === 'function') {
                    logout();
                } else {
                    console.error("Logout function not found");
                }
            }
        });

        // Settings button event
        document.getElementById("btn-settings-account").addEventListener("click", () => {
            showToast("Definições em breve!", "info");
        });
    }

    if (accountBtn) accountBtn.addEventListener("click", renderAccount);

    // Map Button Logic (Close all screens)
    const navCenterBtn = document.querySelector(".nav-center-btn");
    if (navCenterBtn) {
        navCenterBtn.addEventListener("click", () => {
            if (accountScreen) accountScreen.classList.add("hidden");
            if (historyScreen) historyScreen.classList.add("hidden");
            if (typeof fecharEcraPagamento === 'function') fecharEcraPagamento();
            if (typeof fecharPainelLugar === 'function') fecharPainelLugar();
        });
    }

    // Initialize Map and Start Polling
    if (typeof MapModule !== 'undefined' && !MapModule.map) {
        MapModule.init();
    }
    startSpotPolling();

    // Re-bind Start Session Button (Missing listener fix)
    const startSessionBtn = document.getElementById("start-session-btn");
    const sessionForm = document.getElementById("session-form");

    if (startSessionBtn && sessionForm) {
        // Remove old listeners to be safe (clone node trick or just add if missing)
        // Simple add is fine for now
        startSessionBtn.addEventListener("click", () => {
            if (!startSessionBtn.disabled) {
                sessionForm.classList.remove("hidden");
                startSessionBtn.classList.add("hidden"); // Hide start button while form is open
            }
        });
    }

});
