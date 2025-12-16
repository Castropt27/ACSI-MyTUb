// ==================== PAYMENT MODULE ====================

let metodoPagamentoSelecionado = null;

function weekdayPtShort(date) {
    const dias = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
    return dias[date.getDay()];
}

function formatMinutesToHHMM(minutos) {
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime(date) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDate(date) {
    return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}/${date.getFullYear()}`;
}


function abrirEcraPagamento() {
    const screen = document.getElementById("payment-screen");
    if (!screen || !sessaoPendente) return;

    // myTUB Payment Interface Elements
    const timerDisplay = document.getElementById("timer-display");
    const priceDisplay = document.getElementById("price-badge");

    const startTimeEl = document.getElementById("session-start-time");
    const endTimeEl = document.getElementById("session-end-time");
    const startDateEl = document.getElementById("session-start-date");
    const endDateEl = document.getElementById("session-end-date");
    const startWeekEl = document.getElementById("session-start-weekday");
    const endWeekEl = document.getElementById("session-end-weekday");

    const plateTextEl = document.getElementById("session-plate-number");
    const locationNameEl = document.getElementById("location-name");


    const dur = Number(sessaoPendente.duracao);
    const valor = dur * 0.02; // Pricing logic: 0.02€ per minute

    const inicio = sessaoPendente.inicio;
    const fim = new Date(inicio.getTime() + dur * 60000);

    // Update UI
    if (timerDisplay) timerDisplay.textContent = formatMinutesToHHMM(dur);
    if (priceDisplay) priceDisplay.textContent = valor.toFixed(2).replace(".", ",") + " €";

    if (startTimeEl) startTimeEl.textContent = formatTime(inicio);
    if (endTimeEl) endTimeEl.textContent = formatTime(fim);
    if (startDateEl) startDateEl.textContent = formatDate(inicio);
    if (endDateEl) endDateEl.textContent = formatDate(fim);
    if (startWeekEl) startWeekEl.textContent = weekdayPtShort(inicio);
    if (endWeekEl) endWeekEl.textContent = weekdayPtShort(fim);

    const lugarNum = String(sessaoPendente.lugarId).replace("spot-", "");

    if (plateTextEl) {
        plateTextEl.textContent = `${sessaoPendente.matricula} • Lugar ${lugarNum}`;
    }

    if (locationNameEl) {
        locationNameEl.textContent = "Praça do Comércio - Braga";
    }

    screen.classList.remove("hidden");
}

function fecharEcraPagamento() {
    const screen = document.getElementById("payment-screen");
    const modal = document.getElementById("payment-method-modal");
    if (screen) screen.classList.add("hidden");
    if (modal) modal.classList.add("hidden");
    // Don't clear sessaoPendente here instantly if we want to confirm later, but for flow simplicity:
    sessaoPendente = null;
    metodoPagamentoSelecionado = null;
}

function abrirModalMetodos() {
    const methodModal = document.getElementById("payment-method-modal");
    if (!methodModal || !sessaoPendente) return;
    methodModal.classList.remove("hidden");
}

function fecharModalMetodos() {
    const methodModal = document.getElementById("payment-method-modal");
    if (!methodModal) return;
    methodModal.classList.add("hidden");
    metodoPagamentoSelecionado = null;
}

window.PaymentModule = {
    abrirEcraPagamento,
    fecharEcraPagamento,
    abrirModalMetodos,
    fecharModalMetodos
};
