// ==================== MAIN APP LOGIC ====================

// Global State
let placePanel = null;
let sessaoPendente = null;

const lugaresExemplo = [
    { id: 1, nome: "Lugar 1", lat: 41.55387812968043, lng: -8.427430784131518, estado: "LIVRE" },
    { id: 2, nome: "Lugar 2", lat: 41.55384843043613, lng: -8.427553516031361, estado: "OCUPADO" },
    { id: 3, nome: "Lugar 3", lat: 41.55380373739024, lng: -8.427409790834837, estado: "LIVRE" },
    { id: 4, nome: "Lugar 4", lat: 41.55378913544103, lng: -8.427491218943473, estado: "OCUPADO" },
    { id: 5, nome: "Lugar 5", lat: 41.55380041494402, lng: -8.427449068625457, estado: "OCUPADO" },
    { id: 6, nome: "Lugar 6", lat: 41.5538672967433, lng: -8.427490955191352, estado: "OCUPADO" }
];

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
    try {
        const response = await fetch(`${Config.API_BASE_URL}/spots`); // Correct endpoint
        if (response.ok) {
            const data = await response.json();

            // DEBUG: Log received data
            console.log("📍 Dados recebidos do Backend (PC2):", data);

            // Backend returns { spots: [...] }
            if (data.spots && Array.isArray(data.spots)) {
                const lugares = data.spots.map(spot => ({
                    id: spot.spot_id,
                    nome: spot.rua || `Lugar ${spot.spot_id}`,
                    lat: Number(spot.gps_lat),
                    lng: Number(spot.gps_lng),
                    estado: spot.ocupado ? "OCUPADO" : "LIVRE"
                }));

                console.log("🗺️ Lugares processados para o mapa:", lugares);

                desenharLugares(lugares);
                showToast("Dados atualizados.", "success");
            } else {
                console.warn("Invalid data format:", data);
                desenharLugares(lugaresExemplo);
            }
        } else {
            console.warn("Failed to fetch spots:", response.status);
            desenharLugares(lugaresExemplo);
            showToast("Modo offline: Dados de exemplo.", "warning");
        }
    } catch (error) {
        console.error("Error fetching spots:", error);
        desenharLugares(lugaresExemplo);
        // Only show toast if manual refresh (not initial load)? 
        // For now, let's show it to help debugging
        showToast("Erro de conexão. Modo offline.", "error");
    }
}

function abrirPainelLugar(lugar) {
    const panel = document.getElementById("place-panel");
    const statusElem = document.getElementById("place-status");
    const stateTextElem = document.getElementById("place-state-text");
    const startBtn = document.getElementById("start-session-btn");
    const form = document.getElementById("session-form");

    if (!panel || !statusElem || !stateTextElem || !startBtn) return;

    lugarSelecionado = lugar; // Global

    const titleEl = document.getElementById("place-title");
    // const numberEl = document.getElementById("place-number"); // Removed redundant number

    if (titleEl) titleEl.textContent = lugar.nome; // Shows "Lugar X"
    // if (numberEl) numberEl.textContent = lugar.id; // Removed

    const livre = lugar.estado === "LIVRE";

    statusElem.textContent = livre ? "Livre" : "Ocupado";
    statusElem.classList.remove("free", "busy");
    statusElem.classList.add(livre ? "free" : "busy");

    // Simplification: Hide redundant state text if visually duplicate
    if (stateTextElem) stateTextElem.style.display = 'none';

    if (form) {
        form.classList.add("hidden");
        const mi = document.getElementById("matricula-input");
        const di = document.getElementById("duracao-input");
        if (mi) mi.value = "";
        if (di) di.value = "";
    }

    if (livre) {
        startBtn.disabled = false;
        startBtn.textContent = "Criar sessão de estacionamento";
    } else {
        startBtn.disabled = true;
        startBtn.textContent = "Lugar ocupado";
    }

    panel.classList.remove("hidden");
}

function fecharPainelLugar() {
    const panel = document.getElementById("place-panel");
    if (panel) panel.classList.add("hidden");
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

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function () {
    // Check auth session
    if (typeof AuthModule !== 'undefined') {
        AuthModule.checkSession();
    }

    // ----- AUTH LISTENERS -----
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const name = document.getElementById("clientName").value.trim();
            const password = document.getElementById("clientPassword").value;
            const submitBtn = loginForm.querySelector("button[type='submit']");

            if (submitBtn) submitBtn.disabled = true;
            if (submitBtn) submitBtn.textContent = "A entrar...";

            if (typeof AuthModule !== 'undefined') {
                const success = await AuthModule.login(name, password);
                if (success) {
                    showToast("Login efetuado com sucesso!", "success");
                } else {
                    showToast("Credenciais inválidas ou erro de conexão.", "error");
                }
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Entrar";
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

            const valor = duracao * 0.02; // Pricing logic centralized here? Or keep in payment.js?
            // To ensure consistency, let's store it.

            sessaoPendente = {
                lugarId: lugarSelecionado.id,
                lugarNome: lugarSelecionado.nome,
                matricula,
                duracao,
                valor,
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
                showToast(`Método selecionado: ${metodo}. Pagamento confirmado.`, "success");
                fecharEcraPagamento();
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


    // ----- HISTORY SCREEN LOGIC -----
    const historyBtn = document.getElementById("nav-history-btn");
    const historyScreen = document.getElementById("history-screen");
    const accountScreen = document.getElementById("account-screen");
    const accountBtn = document.getElementById("nav-account-btn");

    // Mock History Data
    const mockHistory = [
        {
            id: 1,
            spot: "Lugar 3",
            location: "Praça do Comércio",
            startDate: "2025-12-17T14:30:00",
            endDate: "2025-12-17T15:30:00",
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

    function formatDate(dateStr) {
        const date = new Date(dateStr);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    }

    // Helper to render a single history card
    function renderHistoryCard(item) {
        const isInProgress = item.status === "Em Progresso";
        const statusClass = isInProgress ? "in-progress" : "completed";
        const cardClass = isInProgress ? "history-item active" : "history-item";

        return `
            <div class="${cardClass}">
                <div class="history-card-header">
                    <div class="history-spot-info">
                        <span class="history-spot-icon">${isInProgress ? '🅿️' : '✅'}</span>
                        <div>
                            <div class="history-spot-name">${item.spot}</div>
                            <div class="history-location-text">${item.location}</div>
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

        // Hide other screens
        if (accountScreen) accountScreen.classList.add("hidden");
        const placePanel = document.getElementById("place-panel");
        if (placePanel) placePanel.classList.add("hidden");

        const recentHistory = mockHistory.slice(0, 3);
        const hasMore = mockHistory.length > 3;

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

    function renderFullHistory() {
        if (!historyScreen) return;

        // Group by date
        const grouped = {};
        mockHistory.forEach(item => {
            const dateObj = new Date(item.startDate);
            const dateKey = `${String(dateObj.getDate()).padStart(2, '0')}/${String(dateObj.getMonth() + 1).padStart(2, '0')}/${dateObj.getFullYear()}`;
            if (!grouped[dateKey]) grouped[dateKey] = [];
            grouped[dateKey].push(item);
        });

        const sortedDates = Object.keys(grouped).sort((a, b) => {
            // Convert DD/MM/YYYY back to Date objects for sorting
            const [da, ma, ya] = a.split('/').map(Number);
            const [db, mb, yb] = b.split('/').map(Number);
            // Sort Descending (Newest first): Date B - Date A
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

        // Bind Back button
        const backBtn = document.getElementById("back-history-btn");
        if (backBtn) {
            backBtn.addEventListener("click", renderHistory);
        }
    }

    if (historyBtn) {
        historyBtn.addEventListener("click", renderHistory);
    }


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
                // Close account screen handled by logout usually, or reload
            }
        });

        // Settings button event (placeholder)
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
            if (historyScreen) historyScreen.classList.add("hidden"); // Hide history
            if (typeof fecharEcraPagamento === 'function') fecharEcraPagamento();
            if (typeof fecharPainelLugar === 'function') fecharPainelLugar();
        });
    }

});
