# 📖 Lê Kubik - Guia do Consumidor Kafka

**Para**: Kubik  
**De**: Francisco  
**Data**: 2025-12-11

---

## 🎯 Resumo

Implementei um sistema Kafka que recebe dados de sensores de proximidade do telemóvel (via ZIG SIM) e publica no tópico **`sensor.raw`**.

**Tua task**: Consumir mensagens do tópico `sensor.raw` a partir do broker Kafka no meu PC.

---

## 📂 Ficheiros Importantes do Projeto

Como tens acesso ao projeto completo, consulta estes ficheiros:

| Ficheiro | Descrição |
|----------|-----------|
| [`PC1/docker-compose.yml`](PC1/docker-compose.yml) | Config do Kafka, Zookeeper, sensor-gateway e Kafka UI |
| [`PC1/sensor-gateway/app.py`](PC1/sensor-gateway/app.py) | Microserviço FastAPI que produz para Kafka |
| [`PC1/ZIG SIM/udp_to_http_adapter.py`](PC1/ZIG%20SIM/udp_to_http_adapter.py) | Adapter UDP→HTTP |
| [`Connect README.md`](Connect%20README.md) | Instruções completas de setup e testes |

---

## 🏗️ Arquitetura

```
ZIG SIM (telemóvel) 
    ↓ UDP:5000
udp_to_http_adapter.py (PC, fora Docker)
    ↓ HTTP:8000
sensor-gateway (Docker)
    ↓ Kafka
Kafka Broker (pc-kafka:9092)  ← CONSOME DAQUI
    └─ Tópico: sensor.raw
```

---

## 📋 Config Kafka

| Parâmetro | Valor |
|-----------|-------|
| **Bootstrap Server** | `pc-kafka:9092` |
| **Tópico** | `sensor.raw` |
| **Formato** | JSON (UTF-8) |

---

## 📨 Formato das Mensagens

Cada mensagem tem este JSON:

```json
{
  "id": 1,
  "ocupado": true,
  "timestamp": "2025-12-11T20:10:15.123Z"
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | `int` | ID do sensor (fixo: `1`) |
| `ocupado` | `boolean` | `true` = sensor ativo, `false` = sensor livre |
| `timestamp` | `string` | ISO 8601 com milissegundos (UTC) |

**Vê transformação completa em**: [`PC1/sensor-gateway/app.py`](PC1/sensor-gateway/app.py) (função `convert_timestamp` e endpoint `/`)

---

## 🔌 Como Conectar

### 1. Configurar hostname

Adiciona ao teu ficheiro hosts:

**Windows**: `C:\Windows\System32\drivers\etc\hosts`  
**Linux/Mac**: `/etc/hosts`

```
<IP_DO_MEU_PC>   pc-kafka
```

> Pede-me o IP ou descobre com `ping` na rede local.

### 2. Testar conectividade

```bash
# Teste básico
ping pc-kafka

# Consumir via CLI (se tiveres Kafka instalado)
kafka-console-consumer \
  --bootstrap-server pc-kafka:9092 \
  --topic sensor.raw \
  --from-beginning
```

---

## 💻 Código de Exemplo

### Python (kafka-python)

```python
from kafka import KafkaConsumer
import json

consumer = KafkaConsumer(
    'sensor.raw',
    bootstrap_servers=['pc-kafka:9092'],
    auto_offset_reset='earliest',
    group_id='kubik-consumer-group',
    value_deserializer=lambda x: json.loads(x.decode('utf-8'))
)

for message in consumer:
    data = message.value
    print(f"📨 ID={data['id']}, Ocupado={data['ocupado']}, TS={data['timestamp']}")
```

### Java (Spring Kafka)

```yaml
# application.yml
spring:
  kafka:
    bootstrap-servers: pc-kafka:9092
    consumer:
      group-id: kubik-consumer-group
      auto-offset-reset: earliest
```

```java
@KafkaListener(topics = "sensor.raw", groupId = "kubik-consumer-group")
public void consume(String message) {
    // Processar JSON
}
```

### Node.js (KafkaJS)

```javascript
const kafka = new Kafka({
  brokers: ['pc-kafka:9092']
});

const consumer = kafka.consumer({ groupId: 'kubik-consumer-group' });
await consumer.subscribe({ topic: 'sensor.raw' });
```

---

## 🛠️ Kafka UI para Debug

Interface web para ver mensagens em tempo real:

```
http://pc-kafka:8080
```

**Vê config em**: [`PC1/docker-compose.yml`](PC1/docker-compose.yml) (serviço `kafka-ui`)

---

## ✅ Checklist

- [ ] Configurei `pc-kafka` no ficheiro hosts
- [ ] Consigo fazer ping para `pc-kafka`
- [ ] (Opcional) Acedi ao Kafka UI e vi mensagens em `sensor.raw`
- [ ] Implementei consumer com `bootstrap-server: pc-kafka:9092`
- [ ] Configurei `group-id` único
- [ ] Testei receber mensagens

---

## 🆘 Troubleshooting

| Problema | Solução |
|----------|---------|
| "Connection refused" | Verifica ficheiro hosts e se Kafka está up (`docker ps`) |
| "Topic does not exist" | Envia uma mensagem teste ou pede-me para criar o tópico |
| Consumer não recebe | Confirma `auto.offset.reset='earliest'` e vê Kafka UI |

---

## 📞 Contacto

Se tiveres problemas:
1. Verifica **Kafka UI** (`http://pc-kafka:8080`)
2. Envia-me logs do teu consumer
3. Posso partilhar logs do `sensor-gateway`

**Status**: ✅ Sistema funcional
