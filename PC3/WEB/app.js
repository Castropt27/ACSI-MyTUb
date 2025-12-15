let map;
let markers = [];
let lugarSelecionado = null;
let sessaoPendente = null;
let metodoPagamentoSelecionado = null;

// Lugares fixos na Praça do Comércio
const lugaresExemplo = [
  { id: 1, nome: "Lugar 1", lat: 41.55387812968043, lng: -8.427430784131518, estado: "LIVRE" },
  { id: 2, nome: "Lugar 2", lat: 41.55384843043613, lng: -8.427553516031361, estado: "OCUPADO" },
  { id: 3, nome: "Lugar 3", lat: 41.55380373739024, lng: -8.427409790834837, estado: "LIVRE" },
  { id: 4, nome: "Lugar 4", lat: 41.55378913544103, lng: -8.427491218943473, estado: "OCUPADO" },
  { id: 5, nome: "Lugar 5", lat: 41.55380041494402, lng: -8.427449068625457, estado: "OCUPADO" },
  { id: 6, nome: "Lugar 6", lat: 41.5538672967433, lng: -8.427490955191352, estado: "OCUPADO" }
];

function limparMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
}

function desenharLugares(lugares) {
  limparMarkers();

  lugares.forEach(lugar => {
    const pos = { lat: lugar.lat, lng: lugar.lng };

    const iconUrl = lugar.estado === "OCUPADO"
  ? "https://maps.google.com/mapfiles/ms/icons/red-dot.png"
  : "https://maps.google.com/mapfiles/ms/icons/green-dot.png";

const marker = new google.maps.Marker({
  position: pos,
  map: map,
  title: `${lugar.nome} - ${lugar.estado}`,

  icon: {
    url: iconUrl,
    size: new google.maps.Size(32, 32),
    scaledSize: new google.maps.Size(32, 32),
    labelOrigin: new google.maps.Point(16, 11) // centro do "topo" do pin
  },

  label: {
    text: String(lugar.id),
    color: "#000000",
    fontSize: "13px",
    fontWeight: "700"
  }
});


    marker.addListener("click", () => {
      abrirPainelLugar(lugar);
    });

    markers.push(marker);
  });
}

async function atualizarMapa() {
  // Futuro: buscar ao PC2 com fetch()
  desenharLugares(lugaresExemplo);
}

function abrirPainelLugar(lugar) {
  const panel = document.getElementById("place-panel");
  const statusElem = document.getElementById("place-status");
  const stateTextElem = document.getElementById("place-state-text");
  const startBtn = document.getElementById("start-session-btn");
  const form = document.getElementById("session-form");

  if (!panel || !statusElem || !stateTextElem || !startBtn) return;

  lugarSelecionado = lugar;

  const titleEl = document.getElementById("place-title");
  const numberEl = document.getElementById("place-number");

  if (titleEl) titleEl.textContent = lugar.nome;
  if (numberEl) numberEl.textContent = lugar.id;

  const livre = lugar.estado === "LIVRE";

  statusElem.textContent = livre ? "Livre" : "Ocupado";
  statusElem.classList.remove("free", "busy");
  statusElem.classList.add(livre ? "free" : "busy");
  stateTextElem.textContent = livre ? "Livre" : "Ocupado";

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

function weekdayPtShort(date) {
  const dias = ["Dom.", "Seg.", "Ter.", "Qua.", "Qui.", "Sex.", "Sáb."];
  return dias[date.getDay()];
}

// chamado pelo Google Maps callback
function initMap() {
  const centro = { lat: 41.553863, lng: -8.427441 };

  map = new google.maps.Map(document.getElementById("map"), {
    center: centro,
    zoom: 19
  });

  map.addListener("click", function (e) {
    const coordsElem = document.getElementById("coords");
    if (coordsElem) {
      coordsElem.textContent = `Lat: ${e.latLng.lat().toFixed(6)}, Lng: ${e.latLng.lng().toFixed(6)}`;
    }
    fecharPainelLugar();
  });

  // ------------------ PAGAMENTO ------------------

  function abrirEcraPagamento() {
    const screen = document.getElementById("payment-screen");
    if (!screen || !sessaoPendente) return;

    const timeDisplay = document.getElementById("pay-time-display");
    const priceDisplay = document.getElementById("pay-price-display");

    const startTimeEl = document.getElementById("pay-start-time");
    const endTimeEl = document.getElementById("pay-end-time");
    const startDateEl = document.getElementById("pay-start-date");
    const endDateEl = document.getElementById("pay-end-date");
    const startWeekEl = document.getElementById("pay-start-weekday");
    const endWeekEl = document.getElementById("pay-end-weekday");

    const plateTextEl = document.getElementById("pay-plate-text");
    const placeTextEl = document.getElementById("pay-place-text");

    const lugarSpan = document.getElementById("pay-place");
    const plateSpan = document.getElementById("pay-plate");
    const durSpan = document.getElementById("pay-duration");

    const dur = Number(sessaoPendente.duracao);
    const valor = dur * 0.02;

    const inicio = sessaoPendente.inicio;
    const fim = new Date(inicio.getTime() + dur * 60000);

    if (timeDisplay) timeDisplay.textContent = formatMinutesToHHMM(dur);
    if (priceDisplay) priceDisplay.textContent = valor.toFixed(2).replace(".", ",") + " €";

    if (startTimeEl) startTimeEl.textContent = formatTime(inicio);
    if (endTimeEl) endTimeEl.textContent = formatTime(fim);
    if (startDateEl) startDateEl.textContent = formatDate(inicio);
    if (endDateEl) endDateEl.textContent = formatDate(fim);
    if (startWeekEl) startWeekEl.textContent = weekdayPtShort(inicio);
    if (endWeekEl) endWeekEl.textContent = weekdayPtShort(fim);

    if (plateTextEl) plateTextEl.textContent = sessaoPendente.matricula;
    if (placeTextEl) placeTextEl.textContent = `Lugar ${sessaoPendente.lugarId}`;

    if (lugarSpan) lugarSpan.textContent = String(sessaoPendente.lugarId);
    if (plateSpan) plateSpan.textContent = sessaoPendente.matricula;
    if (durSpan) durSpan.textContent = `${dur} min`;

    screen.classList.remove("hidden");
  }

  function fecharEcraPagamento() {
    const screen = document.getElementById("payment-screen");
    const modal = document.getElementById("payment-method-modal");
    if (screen) screen.classList.add("hidden");
    if (modal) modal.classList.add("hidden");
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

  // ------------------ LISTENERS ------------------

  atualizarMapa();

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
        alert("Por favor insira a matrícula.");
        return;
      }
      if (!duracao || duracao <= 0) {
        alert("Por favor insira a duração em minutos.");
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
      abrirEcraPagamento();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      if (form) form.classList.add("hidden");
    });
  }

  const paymentCancelBtn = document.getElementById("payment-cancel-btn");
  if (paymentCancelBtn) paymentCancelBtn.addEventListener("click", fecharEcraPagamento);

  const chooseBtn = document.getElementById("payment-choose-method-btn");
  if (chooseBtn) chooseBtn.addEventListener("click", abrirModalMetodos);

  const closeModalBtn = document.getElementById("close-method-modal");
  if (closeModalBtn) closeModalBtn.addEventListener("click", fecharModalMetodos);

  const methodModal = document.getElementById("payment-method-modal");
  if (methodModal) {
    methodModal.addEventListener("click", (e) => {
      if (e.target === methodModal) fecharModalMetodos();
    });
  }

  // aviso de 5 min em todos os métodos
  const methodOptions = document.querySelectorAll(".method-option");
  methodOptions.forEach(btn => {
    btn.addEventListener("click", () => {
      if (!sessaoPendente) return;

      metodoPagamentoSelecionado = btn.dataset.method || "Método";

      alert(
        "Importante:\n" +
        "Tem 5 minutos para efetuar o pagamento.\n\n" +
        `Método: ${metodoPagamentoSelecionado}\n\n` +
        `Lugar: ${sessaoPendente.lugarId}\n` +
        `Matrícula: ${sessaoPendente.matricula}\n` +
        `Duração: ${sessaoPendente.duracao} minutos`
      );

      fecharEcraPagamento();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    const modal = document.getElementById("payment-method-modal");
    if (modal && !modal.classList.contains("hidden")) {
      fecharModalMetodos();
      return;
    }

    const screen = document.getElementById("payment-screen");
    if (screen && !screen.classList.contains("hidden")) {
      fecharEcraPagamento();
    }
  });
}
