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
│   PC2 Backend   │────▶│ Kafka Broker │────▶│  Bridge Server  │
│  (Irregularity  │     │  infracoes   │     │   (Node.js)     │
│   Detection)    │     └──────────────┘     └─────────────────┘
└─────────────────┘                                   │
                                                      │ WebSocket
                                                      ▼
                                              ┌──────────────────┐
                                              │  Frontend (SPA)  │
                                              │   HTML/CSS/JS    │
                                              └──────────────────┘
```

### Componentes

1. **PC2 Backend**: Deteta irregularidades e produz eventos para Kafka no tópico `infracoes`
2. **Kafka**: Broker de mensagens que transmite infrações em tempo real
3. **Bridge Server** (Node.js): Consome tópico `infracoes` e transmite via WebSocket para o frontend
4. **Frontend**: Interface móvel SPA com mapa, irregularidades, e gestão de coimas

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
📋 Topic: infracoes
🔌 WebSocket Port: 8081
🚨 Consuming infractions from PC2 backend...
✅ Connected to Kafka
✅ Subscribed to topic: infracoes
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
KAFKA_TOPIC=infracoes             # Tópico de infrações do PC2
KAFKA_GROUP_ID=fiscal-bridge-group

# WebSocket
WS_PORT=8081
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

### PC2 → Kafka (infracoes)

```json
{
  "spot_id": "1",
  "occupied_since": "2025-12-16T09:30:00Z",
  "minutes_occupied": 35
}
```

### Bridge → Frontend (WebSocket)

```json
{
  "type": "IRREGULARITY_DETECTED",
  "spotId": "1",
  "occupiedSince": "2025-12-16T09:30:00Z",
  "minutesOccupied": 35,
  "timestamp": "2025-12-16T10:05:00Z"
}
```

**Campos:**
- `type`: Tipo de evento (`IRREGULARITY_DETECTED`)
- `spotId`: ID do lugar de estacionamento
- `occupiedSince`: Timestamp ISO8601 de quando o lugar foi ocupado
- `minutesOccupied`: Duração de ocupação em minutos

### Lógica de Irregularidades

```
PC2 Backend:
  SE (lugar ocupado SEM sessão válida POR >30 minutos)
    ENTÃO produz evento para Kafka topic "infracoes"
  FIM SE

Fiscal-Mobile:
  QUANDO recebe evento "IRREGULARITY_DETECTED" via WebSocket
    ENTÃO adiciona à lista de irregularidades
    E mostra notificação toast ao fiscal
  FIM QUANDO
```

## 🧪 Testar com Eventos Reais

### Opção 1: PC2 Backend (Recomendado)

1. Certifica-te que o PC2 backend está a correr
2. O PC2 deteta irregularidades automaticamente (lugares ocupados >30 min sem sessão)
3. Eventos são produzidos para Kafka no tópico `infracoes`
4. O fiscal-mobile recebe notificações em tempo real

### Opção 2: Console Producer (Teste Manual)

```bash
docker exec -it kafka kafka-console-producer --bootstrap-server pc-kafka:9092 --topic infracoes
```

Envia eventos manualmente:
```json
{"spot_id":"1","occupied_since":"2025-12-16T09:30:00Z","minutes_occupied":35}
{"spot_id":"2","occupied_since":"2025-12-16T09:45:00Z","minutes_occupied":50}
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

### Infrações não aparecem
- Certifica-te que o PC2 backend está a produzir para o tópico `infracoes`
- Verifica Kafka UI: `http://localhost:8080` → tópico `infracoes`
- Confirma que o bridge está conectado e a receber mensagens
- Verifica console do browser para logs do WebSocket

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

- **Event-Driven Architecture**: Fiscal-mobile agora usa eventos Kafka em tempo real em vez de polling REST
- **Zero Polling**: Eliminou-se a lógica de polling de 5 em 5 segundos, reduzindo carga no backend
- **Real-Time Notifications**: Fiscais recebem notificações instantâneas quando o PC2 deteta infrações
- **Persistência**: Coimas guardadas em localStorage. Para produção, integrar com API REST + PostgreSQL
- **Sem Offline**: App requer ligação contínua ao WebSocket

## 📄 Licença

Projeto académico - ACSI MyTUb

---

**Desenvolvido com ❤️ para Agentes de Fiscalização**
