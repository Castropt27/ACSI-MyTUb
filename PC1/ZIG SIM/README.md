# ZIG SIM - UDP Adapter

Este diretório contém o adapter que converte dados UDP do ZIG SIM para HTTP.

## 📱 Como funciona

```
ZIG SIM (telemóvel)
    │ UDP (porta 5000)
    ▼
udp_to_http_adapter.py (corre no PC, fora do Docker)
    │ HTTP POST
    ▼
sensor-gateway (localhost:8000 → Docker porta 5000)
    │
    ▼
Kafka (tópico sensor.raw)
```

## 🚀 Como usar

### 1. Arrancar o Docker (noutra janela)

```bash
cd PC1
docker compose up --build
```

Esperar até ver:
```
sensor-gateway  | INFO:     Uvicorn running on http://0.0.0.0:5000
```

### 2. Arrancar o adapter UDP

Na pasta `PC1/ZIG SIM/`:

```bash
python udp_to_http_adapter.py
```

Deverás ver:
```
✅ UDP Adapter ready! Listening on port 5000
📤 Will forward to: http://localhost:8000/
Waiting for ZIG SIM data...
```

### 3. Configurar o ZIG SIM

No ZIG SIM (app do telemóvel):

- **Protocolo**: UDP
- **IP**: `<IP_DO_PC>` (ex: `192.168.1.10`)
- **Porta**: `5000`

## 📊 O que vais ver

Quando o ZIG SIM enviar dados, vais ver no terminal do adapter:

```
============================================================
📨 Message #1 from 192.168.1.50:54321
📥 Raw UDP data (234 bytes):
{
  "device": {...},
  "timestamp": "2025_12_11_19:47:00.123",
  "sensordata": {
    "proximitymonitor": {
      "proximitymonitor": true
    }
  }
}
✅ Valid JSON received
✅ Forwarded to gateway successfully
📤 Gateway response: {'status': 'ok', 'received': {...}}
```

## 🔧 Troubleshooting

### ❌ "Could not connect to gateway"

**Problema**: O Docker não está a correr ou o sensor-gateway não arrancou.

**Solução**:
```bash
# Verificar se os containers estão a correr
docker ps

# Deverás ver: zookeeper, kafka, sensor-gateway
```

### ❌ "Address already in use"

**Problema**: Outra aplicação está a usar a porta 5000.

**Solução**:
```bash
# Windows (PowerShell como Admin)
netstat -ano | findstr :5000

# Terminar o processo usando a porta, ou mudar a porta no adapter
```

### ⚠️ "Invalid JSON"

**Problema**: O ZIG SIM enviou dados que não são JSON válido.

**Solução**: Verificar a configuração do ZIG SIM. Deve estar em modo JSON, não texto plano.

## 🧪 Testar sem ZIG SIM

Podes testar o adapter enviando dados UDP manualmente:

**Python:**
```python
import socket
import json

data = {
    "device": {"name": "Test", "uuid": "123", "os": "ios"},
    "timestamp": "2025_12_11_20:00:00.000",
    "sensordata": {"proximitymonitor": {"proximitymonitor": True}}
}

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.sendto(json.dumps(data).encode(), ("localhost", 5000))
```

## 📝 Notas

- O adapter **NÃO** corre dentro do Docker, corre diretamente no PC
- A porta 5000 é usada pelo adapter UDP (fora do Docker)
- O sensor-gateway HTTP está na porta 8000 do host (mapeada para porta 5000 dentro do container)
- Podes correr múltiplos adapters em PCs diferentes, todos a enviar para o mesmo Kafka
