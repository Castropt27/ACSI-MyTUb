# 📖 Lê Kubik - Guia do Consumidor Kafka

**Para**: Kubik  
**De**: Francisco  
**Assunto**: Setup do Produtor Kafka e Como Consumir os Dados

---

## 🎯 Resumo Executivo

Criei um sistema Kafka que recebe dados de sensores de proximidade do telemóvel (via app ZIG SIM) e publica-os num tópico Kafka chamado **`sensor.raw`**.

**O que precisas fazer**: Consumir mensagens do tópico `sensor.raw` a partir do broker Kafka que está no meu PC.

---

## 🏗️ Arquitetura do Sistema

```
┌─────────────────┐
│   ZIG SIM App   │ (Telemóvel)
│   (Sensor)      │
└────────┬────────┘
         │ UDP porta 5000
         │
┌────────▼────────┐
│  UDP → HTTP     │ (Python script no PC1)
│    Adapter      │
└────────┬────────┘
         │ HTTP POST localhost:8000
         │
┌────────▼────────┐
│ sensor-gateway  │ (FastAPI em Docker)
│  Microserviço   │
└────────┬────────┘
         │ Kafka Protocol
         │
┌────────▼────────┐
│  Kafka Broker   │ (Docker)  ← AQUI CONSOMES!
│  pc-kafka:9092  │
│  Tópico:        │
│  sensor.raw     │
└─────────────────┘
```

---

## 📋 Informação Técnica do Kafka

### Configuração do Broker

| Parâmetro | Valor | Notas |
|-----------|-------|-------|
| **Hostname** | `pc-kafka` | Nome lógico do broker |
| **IP** | `<IP do PC1>` | A descobrir na rede local |
| **Porta** | `9092` | Porta padrão Kafka |
| **Bootstrap Servers** | `pc-kafka:9092` | String de conexão |
| **Versão Kafka** | 7.6.0 (Confluent) | Imagem Docker |

### Informação do Tópico

| Parâmetro | Valor |
|-----------|-------|
| **Nome do Tópico** | `sensor.raw` |
| **Partições** | 1 (default) |
| **Replication Factor** | 1 |
| **Formato** | JSON (UTF-8) |
| **Retention** | Default (7 dias) |

---

## 📨 Formato das Mensagens

### Schema do JSON

Cada mensagem no tópico `sensor.raw` tem este formato:

```json
{
  "id": 1,
  "ocupado": true,
  "timestamp": "2025-12-11T20:10:15.123Z"
}
```

### Campos

| Campo | Tipo | Descrição | Valores Possíveis |
|-------|------|-----------|-------------------|
| `id` | `int` | Identificador do sensor (fixo) | `1` |
| `ocupado` | `boolean` | Estado de ocupação do sensor | `true` / `false` |
| `timestamp` | `string` | Timestamp ISO 8601 com milissegundos | `YYYY-MM-DDTHH:mm:ss.fffZ` |

### Exemplos de Mensagens

**Sensor detetou ocupação:**
```json
{
  "id": 1,
  "ocupado": true,
  "timestamp": "2025-12-11T20:10:15.456Z"
}
```

**Sensor detetou desocupação:**
```json
{
  "id": 1,
  "ocupado": false,
  "timestamp": "2025-12-11T20:10:20.789Z"
}
```

---

## 🔌 Como Conectar ao Kafka (Para Kubik)

### Passo 1: Configurar o ficheiro `hosts`

Para te ligares ao Kafka usando o hostname `pc-kafka`, adiciona ao teu ficheiro hosts:

**Windows** (`C:\Windows\System32\drivers\etc\hosts`):
```
<IP_DO_PC1>   pc-kafka
```

**Linux/Mac** (`/etc/hosts`):
```
<IP_DO_PC1>   pc-kafka
```

> ⚠️ **Importante**: Substitui `<IP_DO_PC1>` pelo IP real do meu PC na rede local.  
> Para descobrir, eu executo `ipconfig` no Windows ou `ip addr` no Linux.

### Passo 2: Testar Conectividade

Antes de configurar o teu consumer, testa se consegues alcançar o broker:

**Opção A - Ping:**
```bash
ping pc-kafka
```

**Opção B - Telnet (verificar porta 9092):**
```bash
telnet pc-kafka 9092
```

**Opção C - Kafka Console Consumer (se tiveres Kafka instalado):**
```bash
kafka-console-consumer \
  --bootstrap-server pc-kafka:9092 \
  --topic sensor.raw \
  --from-beginning
```

---

## 💻 Código de Exemplo para Consumir

### Python (kafka-python)

```python
from kafka import KafkaConsumer
import json

# Configurar consumer
consumer = KafkaConsumer(
    'sensor.raw',
    bootstrap_servers=['pc-kafka:9092'],
    auto_offset_reset='earliest',  # Ler desde o início
    enable_auto_commit=True,
    group_id='kubik-consumer-group',  # Teu grupo de consumidores
    value_deserializer=lambda x: json.loads(x.decode('utf-8'))
)

print("🎧 A ouvir mensagens do tópico sensor.raw...")

# Consumir mensagens
for message in consumer:
    data = message.value
    print(f"📨 Recebido: ID={data['id']}, Ocupado={data['ocupado']}, Timestamp={data['timestamp']}")
    
    # Processar a mensagem
    if data['ocupado']:
        print("✅ Sensor OCUPADO")
    else:
        print("❌ Sensor LIVRE")
```

**Instalar dependências:**
```bash
pip install kafka-python
```

---

### Java (Spring Kafka)

**application.yml:**
```yaml
spring:
  kafka:
    bootstrap-servers: pc-kafka:9092
    consumer:
      group-id: kubik-consumer-group
      auto-offset-reset: earliest
      key-deserializer: org.apache.kafka.common.serialization.StringDeserializer
      value-deserializer: org.apache.kafka.common.serialization.StringDeserializer
```

**Consumer Class:**
```java
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class SensorConsumer {
    
    private final ObjectMapper objectMapper = new ObjectMapper();
    
    @KafkaListener(topics = "sensor.raw", groupId = "kubik-consumer-group")
    public void consume(String message) {
        try {
            SensorData data = objectMapper.readValue(message, SensorData.class);
            System.out.println("📨 Recebido: " + data);
            
            if (data.isOcupado()) {
                System.out.println("✅ Sensor OCUPADO");
            } else {
                System.out.println("❌ Sensor LIVRE");
            }
        } catch (Exception e) {
            System.err.println("Erro ao processar mensagem: " + e.getMessage());
        }
    }
}

// DTO
class SensorData {
    private int id;
    private boolean ocupado;
    private String timestamp;
    
    // Getters e Setters
}
```

---

### Node.js (KafkaJS)

```javascript
const { Kafka } = require('kafkajs');

// Configurar Kafka client
const kafka = new Kafka({
  clientId: 'kubik-consumer',
  brokers: ['pc-kafka:9092']
});

const consumer = kafka.consumer({ 
  groupId: 'kubik-consumer-group' 
});

const run = async () => {
  await consumer.connect();
  await consumer.subscribe({ 
    topic: 'sensor.raw', 
    fromBeginning: true 
  });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      const data = JSON.parse(message.value.toString());
      console.log(`📨 Recebido:`, data);
      
      if (data.ocupado) {
        console.log('✅ Sensor OCUPADO');
      } else {
        console.log('❌ Sensor LIVRE');
      }
    },
  });
};

run().catch(console.error);
```

**Instalar dependências:**
```bash
npm install kafkajs
```

---

## 🛠️ Ferramentas Úteis

### Kafka UI (Recomendado para Debug)

Podes aceder à interface web do Kafka UI para verificar mensagens antes de implementar o consumer:

```
http://pc-kafka:8080
```

**Funcionalidades:**
- ✅ Ver mensagens do tópico `sensor.raw` em tempo real
- ✅ Pesquisar e filtrar mensagens
- ✅ Ver estatísticas de consumo
- ✅ Monitorizar lag dos consumidores

---

## 🔍 Informação Adicional

### Como Funciona o Produtor (Para Contexto)

1. **ZIG SIM** (app de telemóvel) envia dados do sensor de proximidade via **UDP** para o meu PC
2. **UDP Adapter** (script Python) recebe UDP e converte para HTTP POST
3. **Sensor Gateway** (microserviço FastAPI) recebe o JSON "grande" do ZIG SIM
4. **Transformação**: Extrai apenas `proximitymonitor` e `timestamp`, cria JSON simples
5. **Publicação**: Envia para Kafka no tópico `sensor.raw`

### Dados Originais do ZIG SIM (Antes da Transformação)

Para contexto, o JSON original que o ZIG SIM envia é este:

```json
{
  "device": {
    "name": "unknown device (iPhone14,3)",
    "displayheight": 2208,
    "uuid": "U8sb1vgccfEWIlZC",
    "os": "ios",
    "osversion": "18.5",
    "displaywidth": 1242
  },
  "timestamp": "2025_12_11_19:22:06.190",
  "sensordata": {
    "proximitymonitor": {
      "proximitymonitor": true
    }
  }
}
```

O meu **sensor-gateway** simplifica isto para:

```json
{
  "id": 1,
  "ocupado": true,
  "timestamp": "2025-12-11T19:22:06.190Z"
}
```

---

## ✅ Checklist para Kubik

Antes de começar a consumir, verifica:

- [ ] Adicionei `pc-kafka` ao ficheiro hosts
- [ ] Consigo fazer ping para `pc-kafka`
- [ ] (Opcional) Acedi ao Kafka UI em `http://pc-kafka:8080` e vi mensagens no tópico `sensor.raw`
- [ ] Escolhi uma biblioteca Kafka (kafka-python, Spring Kafka, KafkaJS, etc.)
- [ ] Configurei o `bootstrap-server` como `pc-kafka:9092`
- [ ] Configurei o `topic` como `sensor.raw`
- [ ] Defini um `group-id` único (ex: `kubik-consumer-group`)
- [ ] Implementei deserialização JSON das mensagens
- [ ] Testei receber mensagens

---

## 🆘 Troubleshooting

### Problema: "Connection refused" ou "Unable to connect to Kafka"

**Causas possíveis:**
1. Hostname `pc-kafka` não configurado no `/etc/hosts`
2. Firewall no PC1 está a bloquear a porta 9092
3. O Docker não está a correr no PC1

**Solução:**
- Verificar ficheiro hosts
- Pedir-me para abrir porta 9092 no firewall do Windows
- Confirmar comigo se o Kafka está up: `docker ps` deve mostrar container `kafka`

### Problema: "Topic does not exist"

**Solução:**
O tópico `sensor.raw` é criado automaticamente quando a primeira mensagem é enviada. Se ainda não existir:
- Envia uma mensagem de teste do ZIG SIM
- Ou cria manualmente o tópico (posso fazer isso se precisares)

### Problema: Consumer não recebe mensagens

**Checklist:**
1. Confirma que `auto.offset.reset` está configurado (usa `earliest` para ler desde o início)
2. Verifica se há mensagens no tópico via Kafka UI
3. Confirma que o `group-id` está correto
4. Vê se há erros de deserialização JSON

---

## 📞 Contacto

Se tiveres problemas ou dúvidas:

1. Verifica primeiro o **Kafka UI** (`http://pc-kafka:8080`) para confirmar que as mensagens estão a chegar
2. Envia-me os logs de erro do teu consumer
3. Posso partilhar-te logs do meu produtor (`sensor-gateway`)

**Ferramentas de debug que podes usar:**
- Kafka Console Consumer (CLI)
- Kafka UI (Web)
- Logs do teu consumer

---

**Versão**: 1.0  
**Data**: 2025-12-11  
**Status**: ✅ Sistema em produção e funcional

Boa sorte com a implementação! 🚀
