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

    async function processarPagamento() {
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

        // Show warnings/processing immediately
        showToast(`Pedido enviado para ${phone}. Tem 5 minutos para confirmar na app MB WAY.`, "success", 5000);

        // Save phone to session (global)
        if (typeof sessaoPendente !== 'undefined' && sessaoPendente) {
            sessaoPendente.telemovel = phoneDigits;
        }

        fecharModalMBWay();

        // Submit to Backend
        try {
            if (typeof sessaoPendente === 'undefined' || !sessaoPendente) {
                console.error("No pending session");
                return;
            }

            // Using Config.API_BASE_URL (Ensure Config is loaded)
            if (typeof Config === 'undefined') {
                console.error("Config not loaded");
                return;
            }

            const payload = {
                telemovel: phoneDigits,
                matricula: sessaoPendente.matricula,
                valor: sessaoPendente.valor,
                duracao: sessaoPendente.duracao, // Sent in minutes
                lugarId: sessaoPendente.lugarId,
                metodo: "MB WAY"
            };

            // Non-blocking fetch? 
            // If we want to simulate the 6s delay regardless of backend speed (which might be instant or slow),
            // we can just fire and forget, or await.
            // The user wants the 6s delay UI flow.

            // We'll fire the request. If it fails, we might want to tell the user?
            // But for the prototype flow "ao passar 6 segundos faça aparece o popup".

            fetch(`${Config.API_BASE_URL}/pagamentos/mbway`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            }).then(res => {
                if (!res.ok) console.warn("Backend payment error:", res.status);
            }).catch(err => console.error("Backend payment connection error:", err));

        } catch (e) {
            console.error("Payment logic error:", e);
        }

        // 2. Wait 6 seconds then show success (Simulated flow as requested)
        setTimeout(() => {
            if (typeof window.finishParkingSession === 'function') {
                window.finishParkingSession("MB WAY");
            } else {
                showToast(`Método selecionado: MB WAY. Pagamento confirmado.`, "success");

                // Close parent payment screen if it exists (dependency on PaymentModule or global function)
                if (window.PaymentModule && typeof window.PaymentModule.fecharEcraPagamento === 'function') {
                    window.PaymentModule.fecharEcraPagamento();
                } else if (typeof fecharEcraPagamento === 'function') {
                    fecharEcraPagamento();
                }
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
