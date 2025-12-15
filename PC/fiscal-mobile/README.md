# myTUB Fiscal

Mobile web app para Agentes de Fiscalização com integração Kafka em tempo real.

![Logo](./assets/logo.png)

## 📋 Visão Geral

O **myTUB Fiscal** é uma aplicação móvel (HTML/CSS/JS vanilla) que permite aos agentes de fiscalização:
- Visualizar lugares de estacionamento num mapa em tempo real
- Detetar irregularidades (lugares ocupados sem sessão de pagamento válida >5 min)
- Emitir coimas com provas (fotos, GPS, timestamp)
- Gerir estados de coimas (Emitida, Notificada, Paga, Em Recurso, Anulada)

## 🏗️ Arquitetura

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────┐
│   ZIG SIM App   │────▶│ Kafka Broker │────▶│  Bridge Server  │
│  (Smartphone)   │     │ sensor.raw   │     │  (Node.js)      │
└─────────────────┘     └──────────────┘     └─────────────────┘
                                                      │
                                                      │ WebSocket
                                                      ▼
                                              ┌──────────────────┐
                                              │  Frontend (SPA)  │
                                              │   HTML/CSS/JS    │
                                              └──────────────────┘
```

### Componentes

1. **Kafka**: Recebe eventos de sensores de proximidade via tópico `sensor.raw`
2. **Bridge Server** (Node.js): Consome Kafka e transmite via WebSocket para o frontend
3. **Frontend**: Interface móvel SPA com mapa, irregularidades, e gestão de coimas

## 🚀 Setup

### Pré-requisitos

- Docker + Docker Compose (para Kafka)
- Node.js 16+ (para bridge)
- Browser moderno com suporte a Geolocation API

### 1. Iniciar Kafka (PC1)

```bash
cd ../PC1
docker-compose up -d
```

Verifica que os serviços estão a correr:
```bash
docker ps
```

Deverás ver: `kafka`, `zookeeper`, `sensor-gateway`, `kafka-ui`

### 2. Configurar e Iniciar Bridge

```bash
cd bridge

# Copiar e editar variáveis de ambiente (opcional)
copy .env.example .env

# Instalar dependências
npm install

# Iniciar bridge
npm start
```

**Output esperado:**
```
🚀 Starting myTUB Fiscal Bridge...
📡 Kafka Brokers: localhost:9093
📋 Topic: sensor.raw
🔌 WebSocket Port: 8081
🅿️  Simulating 10 parking spots
✅ Connected to Kafka
✅ Subscribed to topic: sensor.raw
✅ WebSocket server running on ws://localhost:8081
```

### 3. Abrir Frontend

1. Abre `web/index.html` directamente no browser (ou usa live server)
2. **Login**: Insere nome e ID de fiscal (ex: "João" e "F001")
3. Permite acesso à localização quando solicitado

## 📱 Como Usar

### 1. Mapa
- Visualiza todos os lugares de estacionamento
- **Verde**: Livre
- **Vermelho**: Ocupado
- **Cinzento**: Sem dados
- A tua posição está marcada a azul

### 2. Irregularidades
- Lista de lugares ocupados SEM sessão de pagamento válida por >5 min
- Ordenados por prioridade (duração + distância)
- **Ver no mapa**: Navega para o lugar no mapa
- **Validar e emitir coima**: Abre formulário de coima

### 3. Emitir Coima
- **Matrícula**: Obrigatório (formato AA-00-BB)
- **GPS**: Obtém localização automaticamente
- **Fotos**: 1-3 fotos obrigatórias (câmara do dispositivo)
- **Observações**: Opcional
- **Tolerância**: Só permite multar após 5 minutos ocupado

### 4. Coimas
- Lista de todas as coimas emitidas
- Clica numa coima para ver detalhes
- Alterar estados:
  - Marcar Notificada
  - Marcar Paga
  - Marcar Em Recurso
  - Anular

### 5. Perfil
- Visualiza info do fiscal logado
- **Terminar Sessão**: Logout

## 🔧 Configuração

### Bridge Environment Variables

Edita `.env` na pasta `bridge/`:

```env
# Kafka
KAFKA_BROKERS=localhost:9093      # Broker externo
KAFKA_TOPIC=sensor.raw
KAFKA_GROUP_ID=fiscal-bridge-group

# WebSocket
WS_PORT=8081

# Simulação
NUM_SPOTS=10                      # Número de lugares a simular
```

### Spots Configuration

Edita `web/spots.sample.json` para alterar lugares:

```json
[
  {
    "spotId": "P001",
    "rua": "Rua Augusta",
    "lat": 38.7091,
    "lng": -9.1364,
    "zone": "baixa"
  }
]
```

## 📡 Formato de Dados

### Kafka → Bridge (sensor.raw)

```json
{
  "id": 1,
  "ocupado": true,
  "timestamp": "2025-12-15T19:00:00.000Z"
}
```

### Bridge → Frontend (WebSocket)

```json
{
  "spotId": "P001",
  "state": "occupied",
  "hasValidSession": false,
  "timestamp": "2025-12-15T19:00:00.000Z",
  "receivedAt": "2025-12-15T19:00:01.000Z"
}
```

**Campos:**
- `state`: `"free"` | `"occupied"`
- `hasValidSession`: Se o lugar tem sessão de pagamento válida (simulado: 30% dos ocupados)

### Lógica de Irregularidades

```
SE (state === "occupied" AND hasValidSession === false)
  ENTÃO rastreia tempo ocupado
  SE tempo > 5 minutos
    ENTÃO adiciona a "Irregularidades"
  FIM SE
SENÃO
  remove de "Irregularidades"
FIM SE
```

## 🧪 Testar com Eventos Reais

### Opção 1: ZIG SIM (Recomendado)

1. Instala ZIG SIM no smartphone
2. Configura IP do PC no PC1/ZIG SIM/udp_to_http_adapter.py
3. Executa adapter: `python udp_to_http_adapter.py`
4. Inicia app ZIG SIM e ativa proximity sensor

### Opção 2: Console Producer (Manual)

```bash
docker exec -it kafka kafka-console-producer --bootstrap-server pc-kafka:9092 --topic sensor.raw
```

Envia eventos manualmente:
```json
{"id":1,"ocupado":true,"timestamp":"2025-12-15T19:00:00.000Z"}
{"id":1,"ocupado":false,"timestamp":"2025-12-15T19:06:00.000Z"}
```

## 🐛 Troubleshooting

### WebSocket não conecta
- Verifica que o bridge está a correr (`npm start`)
- Confirma porta 8081 disponível
- Abre DevTools → Network → WS para ver tentativas de conexão

### Mapa não carrega
- Verifica ligação à internet (Leaflet CDN)
- Permite geolocalização no browser
- Abre DevTools → Console para erros

### Kafka não recebe mensagens
- Verifica que PC1 Docker está a correr: `docker ps`
- Testa conectividade: `http://localhost:8080` (Kafka UI)
- Confirma que sensor-gateway está a receber: `docker logs sensor-gateway`

### Irregularidades não aparecem
- Espera >5 minutos com sensor `ocupado: true` e `hasValidSession: false`
- Verifica console do browser para logs do WebSocket
- Confirma que o bridge está a enviar `hasValidSession: false` (aparece em 70% dos eventos)

## 📚 Stack Tecnológica

### Backend (Bridge)
- **Node.js** + **KafkaJS** (consumer)
- **ws** (WebSocket server)
- **dotenv** (config)

### Frontend
- **Vanilla JavaScript** (SPA)
- **Leaflet.js** (mapas via CDN)
- **OpenStreetMap** (tiles)
- **localStorage** (persistência)
- **Geolocation API** (GPS)
- **FileReader API** (fotos base64)

### Infraestrutura
- **Apache Kafka** (broker de eventos)
- **Docker Compose** (orquestração)

## ✨ Funcionalidades

✅ Login simples sem password  
✅ Mapa em tempo real com Leaflet + OSM  
✅ Marcadores de lugares com 3 estados (livre/ocupado/desconhecido)  
✅ Deteção de posição do fiscal via GPS  
✅ WebSocket com reconnect automático  
✅ Irregularidades priorizadas por tempo + distância  
✅ Emissão de coimas com validação de tolerância (5 min)  
✅ Captura de fotos via câmara do dispositivo  
✅ GPS com precisão em metros  
✅ Gestão de estados de coimas com histórico  
✅ localStorage para persistência local  
✅ Design mobile-first responsivo  
✅ Acessibilidade WCAG AA (ARIA, focus, contrast)  
✅ Bottom tabs navigation  
✅ Toast notifications  

## 📝 Notas

- **Simulação de Sessões**: O bridge atribui aleatoriamente `hasValidSession` (30% true) para demo. Numa implementação real, isto viria de uma API de pagamentos.
- **Persistência**: Coimas guardadas em localStorage. Para produção, integrar com API REST + PostgreSQL.
- **Sem Offline**: App requer ligação contínua ao WebSocket.
- **Spot ID Mapping**: Como o sensor envia sempre `id: 1`, o bridge distribui eventos por round-robin para simular 10 lugares distintos.

## 📄 Licença

Projeto académico - ACSI MyTUb

---

**Desenvolvido com ❤️ para Agentes de Fiscalização**
