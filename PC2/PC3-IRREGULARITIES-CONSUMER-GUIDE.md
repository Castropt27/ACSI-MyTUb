# Guia: Consumir Irregularidades do Kafka no PC3

## O que muda no PC3?

O PC3 passa a ouvir o tópico `notifications.irregularities` com log compaction. Isto significa:
- **Cada lugar tem no máximo 1 mensagem** (a mais recente).
- `IRREGULARITY_DETECTED` = lugar ocupado sem sessão.
- `IRREGULARITY_RESOLVED` = lugar ficou livre, irregularidade desapareceu.

---

## Opção 1: Se PC3 tem backend próprio (Node.js, Python, Java, etc.)

### Instalação (Node.js exemplo)

```bash
npm install kafkajs
```

### Consumer.js (Node.js)

```javascript
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'pc3-irregularities-consumer',
  brokers: ['192.168.21.227:9093']
});

const consumer = kafka.consumer({ groupId: 'pc3-fiscal-group' });

(async () => {
  await consumer.connect();
  
  // Subscribe ao tópico com compaction ativada
  await consumer.subscribe({ 
    topic: 'notifications.irregularities',
    fromBeginning: true  // ← IMPORTANTE: começa do início (vê compacted log)
  });

  // State local: Map de spotId → status
  const irregularities = new Map(); // { spotId: { type, message, timestamp } }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const spotId = payload.spot_id;

        if (payload.type === 'IRREGULARITY_DETECTED') {
          // Adiciona à lista
          irregularities.set(spotId, {
            type: 'DETECTED',
            message: payload.message,
            timestamp: payload.timestamp
          });
          console.log(`🔴 ALERTA: Lugar ${spotId} - ${payload.message}`);
          // Emitir para frontend (via WebSocket, REST, etc.)
          // emitToClients({ type: 'irregularity_alert', spotId, payload });
        } 
        else if (payload.type === 'IRREGULARITY_RESOLVED') {
          // Remove da lista
          irregularities.delete(spotId);
          console.log(`✅ RESOLVIDO: Lugar ${spotId}`);
          // Emitir para frontend
          // emitToClients({ type: 'irregularity_cleared', spotId });
        }
      } catch (e) {
        console.error('Erro processando mensagem:', e);
      }
    }
  });
})();

// Endpoint para fiscal consultar alertas atuais
app.get('/api/fiscal/active-alerts', (req, res) => {
  const alerts = Array.from(irregularities.entries()).map(([spotId, data]) => ({
    spotId,
    ...data
  }));
  res.json(alerts);
});
```

### Consumer.py (Python)

```python
from kafka import KafkaConsumer
import json
import threading

# Dict global para manter estado
irregularities = {}
lock = threading.Lock()

def start_kafka_consumer():
    consumer = KafkaConsumer(
        'notifications.irregularities',
        bootstrap_servers='192.168.21.227:9093',
        group_id='pc3-fiscal-group',
        auto_offset_reset='earliest',  # ← IMPORTANTE: começa do início
        value_deserializer=lambda m: json.loads(m.decode('utf-8'))
    )
    
    for message in consumer:
        payload = message.value
        spot_id = payload.get('spot_id')
        msg_type = payload.get('type')
        
        if msg_type == 'IRREGULARITY_DETECTED':
            with lock:
                irregularities[spot_id] = {
                    'type': 'DETECTED',
                    'message': payload.get('message'),
                    'timestamp': payload.get('timestamp')
                }
            print(f"🔴 ALERTA: Lugar {spot_id} - {payload.get('message')}")
        
        elif msg_type == 'IRREGULARITY_RESOLVED':
            with lock:
                irregularities.pop(spot_id, None)
            print(f"✅ RESOLVIDO: Lugar {spot_id}")

# Iniciar consumer em thread
threading.Thread(target=start_kafka_consumer, daemon=True).start()

# Endpoint Flask
@app.get('/api/fiscal/active-alerts')
def get_active_alerts():
    with lock:
        alerts = [
            {'spotId': k, **v}
            for k, v in irregularities.items()
        ]
    return jsonify(alerts)
```

---

## Opção 2: Se PC3 é frontend puro (HTML/JavaScript)

Se não há backend, polling HTTP a PC2:

```javascript
// poll-irregularities.js

// Estado local no browser
let activeIrregularities = {};

async function pollIrregularities() {
  try {
    // Consultar estado atual em PC2 (via GET de view/snapshot)
    // PC2 mantém BD com irregularidades atuais
    const response = await fetch('http://192.168.21.17:8000/api/fiscal/irregularities');
    const spots = await response.json();
    
    // Comparar com estado anterior e atualizar UI
    const previousIds = Object.keys(activeIrregularities);
    const currentIds = spots.map(s => s.spotId);
    
    // Novos alertas
    for (const spot of spots) {
      if (!activeIrregularities[spot.spotId]) {
        activeIrregularities[spot.spotId] = spot;
        showAlert(spot.spotId, spot.message); // UI update
      }
    }
    
    // Alertas resolvidos
    for (const id of previousIds) {
      if (!currentIds.includes(id)) {
        delete activeIrregularities[id];
        clearAlert(id); // UI update
      }
    }
  } catch (e) {
    console.error('Erro polling irregularities:', e);
  }
}

// Polling a cada 2 segundos
setInterval(pollIrregularities, 2000);
```

---

## Configuração do Tópico (PC2 - já feito)

Executar em PC1 ou via terminal Docker:

```bash
# Dentro do container Kafka ou via docker exec
kafka-topics --bootstrap-server 192.168.21.227:9093 \
  --topic notifications.irregularities \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.5 \
  --config segment.ms=60000 \
  --alter
```

Ou usar o script `setup-compacted-topic.sh` em PC2.

---

## Fluxo de Dados

```
Sensor (PC1)
    ↓
sensor.raw (Kafka)
    ↓
PC2 IrregularitiesPublisher
    ├─ Lugar ocupado + sem sessão → IRREGULARITY_DETECTED
    └─ Lugar vago → IRREGULARITY_RESOLVED
    ↓
notifications.irregularities (compacted)
    ↓
PC3 Consumer
    ├─ Lê do início (vê última por spotId)
    ├─ Atualiza state local (Map/Dict)
    └─ Emite para UI / armazena em BD local
```

---

## Estrutura de Mensagens

### DETECTED
```json
{
  "type": "IRREGULARITY_DETECTED",
  "spot_id": "1",
  "ocupado": true,
  "minutes_occupied": 35.2,
  "timestamp": "2025-12-17T18:30:00Z",
  "message": "Lugar 1 ocupado sem sessão válida"
}
```

### RESOLVED
```json
{
  "type": "IRREGULARITY_RESOLVED",
  "spot_id": "1",
  "timestamp": "2025-12-17T18:35:00Z",
  "message": "Lugar 1 agora vago - irregularidade resolvida"
}
```

---

## Verificação

### Testar Consumer

```bash
# Ver mensagens do tópico compacted (últimas por chave)
kafka-console-consumer --bootstrap-server 192.168.21.227:9093 \
  --topic notifications.irregularities \
  --from-beginning \
  --property print.key=true
```

### Expected Output
```
1  {"type":"IRREGULARITY_DETECTED","spot_id":"1",...}
1  {"type":"IRREGULARITY_RESOLVED","spot_id":"1",...}
2  {"type":"IRREGULARITY_DETECTED","spot_id":"2",...}
```

Note: Uma única mensagem por `spotId` (a mais recente).

---

## Dicas

- **`fromBeginning: true`**: Essencial para ver compacted log.
- **Group ID**: `pc3-fiscal-group` (fiscais leem mesmo estado).
- **State local**: Manter Map em memória ou BD local sincronizado com Kafka.
- **UI**: Mostrar só o que está no state (sempre sincronizado).
- **Webhook**: Se quiseres notificações em tempo real, emitir WebSocket/SSE ao recepcionar mensagem.

---

## Próximos Passos

1. Escolher implementação (backend + Kafka consumer ou polling HTTP).
2. Testar com lugar forçado a ocupado + sem sessão.
3. Validar que RESOLVED chega e limpa UI.
