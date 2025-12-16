// ==================== MB WAY MODULE ====================

const MbWayModule = (function () {
    // DOM Elements
    let mbwayModal = null;
    let closeMBWayBtn = null;
    let mbwayConfirmBtn = null;
    let mbwayPhoneInput = null;

    function init() {
        mbwayModal = document.getElementById("mbway-modal");
        closeMBWayBtn = document.getElementById("close-mbway-modal");
        mbwayConfirmBtn = document.getElementById("mbway-confirm-btn");
        mbwayPhoneInput = document.getElementById("mbway-phone");

        bindEvents();
    }

    function bindEvents() {
        if (closeMBWayBtn) {
            closeMBWayBtn.addEventListener("click", fecharModalMBWay);
        }

        if (mbwayModal) {
            mbwayModal.addEventListener("click", (e) => {
                if (e.target === mbwayModal) fecharModalMBWay();
            });
        }

        if (mbwayConfirmBtn) {
            mbwayConfirmBtn.addEventListener("click", processarPagamento);
        }

        // Handle Enter key in phone input
        if (mbwayPhoneInput) {
            mbwayPhoneInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    processarPagamento();
                }
            });
        }
    }

    function abrirModalMBWay() {
        if (mbwayModal) {
            mbwayModal.classList.remove("hidden");
            if (mbwayPhoneInput) mbwayPhoneInput.value = "";
            mbwayPhoneInput?.focus();
        }
    }

    function fecharModalMBWay() {
        if (mbwayModal) mbwayModal.classList.add("hidden");
    }

    function processarPagamento() {
        const phone = mbwayPhoneInput?.value.trim();
        if (!phone) {
            showToast("Por favor introduza o número de telemóvel.", "error");
            return;
        }

        // Basic validation (9 digits)
        const phoneDigits = phone.replace(/\s/g, "");
        if (phoneDigits.length !== 9 || !/^\d{9}$/.test(phoneDigits)) {
            showToast("Número de telemóvel inválido. Deve ter 9 dígitos.", "error");
            return;
        }

        // 1. Show Warning (Non-blocking toast)
        showToast(`Pedido enviado para ${phone}. Tem 5 minutos para confirmar na app MB WAY.`, "success", 5000);

        fecharModalMBWay();

        // 2. Wait 6 seconds then show success
        setTimeout(() => {
            showToast(`Método selecionado: MB WAY. Pagamento confirmado.`, "success");

            // Close parent payment screen if it exists (dependency on PaymentModule or global function)
            if (window.PaymentModule && typeof window.PaymentModule.fecharEcraPagamento === 'function') {
                window.PaymentModule.fecharEcraPagamento();
            } else if (typeof fecharEcraPagamento === 'function') {
                fecharEcraPagamento();
            }
        }, 6000);
    }

    // Public API
    return {
        init,
        abrirModal: abrirModalMBWay,
        fecharModal: fecharModalMBWay
    };
})();

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    MbWayModule.init();
});
