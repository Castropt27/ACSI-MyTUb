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
    desenharLugares(lugaresExemplo);
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

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
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

            const metodo = btn.dataset.method || "Método";
            showToast(`Método selecionado: ${metodo}. Pagamento confirmado.`, "success");

            fecharEcraPagamento();
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

    // ----- ACCOUNT SCREEN LOGIC -----
    const accountBtn = document.getElementById("nav-account-btn");
    const accountScreen = document.getElementById("account-screen");

    function renderAccount() {
        if (!accountScreen) return;

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
            if (typeof AuthModule !== 'undefined' && AuthModule.logout) AuthModule.logout();
        });
    }

    if (accountBtn) accountBtn.addEventListener("click", renderAccount);

    // Map Button Logic (Close all screens)
    const navCenterBtn = document.querySelector(".nav-center-btn");
    if (navCenterBtn) {
        navCenterBtn.addEventListener("click", () => {
            if (accountScreen) accountScreen.classList.add("hidden");
            if (typeof fecharEcraPagamento === 'function') fecharEcraPagamento();
            if (typeof fecharPainelLugar === 'function') fecharPainelLugar();
        });
    }

});
