# 🌐 Tutorial de Ligação ao Sistema Kafka + Sensor Gateway

Este documento explica como configurar outros PCs para se ligarem ao sistema Kafka e sensor-gateway que corre no PC1.

## 📋 Índice

1. [Configurar o ficheiro hosts](#1-configurar-o-ficheiro-hosts)
2. [Ligar o ZIG SIM ao Gateway](#2-ligar-o-zig-sim-ao-gateway)
3. [Arrancar o Sistema no PC1](#3-arrancar-o-sistema-no-pc1)
4. [Testar o Sistema](#4-testar-o-sistema)

---

## 1️⃣ Configurar o ficheiro hosts

Para que outros PCs possam comunicar com o Kafka usando o hostname `pc-kafka`, é necessário adicionar uma entrada no ficheiro hosts de cada máquina.

### 🪟 Windows

1. Abrir o Bloco de Notas **como Administrador**
2. Abrir o ficheiro: `C:\Windows\System32\drivers\etc\hosts`
3. Adicionar a seguinte linha no final do ficheiro:

```
192.168.1.10   pc-kafka
```

> ⚠️ **Nota**: Substituir `192.168.1.10` pelo **IP real do PC1** na vossa rede.

4. Guardar o ficheiro

### 🐧 Linux / 🍎 macOS

1. Abrir um terminal
2. Editar o ficheiro hosts com permissões de superutilizador:

```bash
sudo nano /etc/hosts
```

3. Adicionar a seguinte linha no final do ficheiro:

```
192.168.1.10   pc-kafka
```

> ⚠️ **Nota**: Substituir `192.168.1.10` pelo **IP real do PC1** na vossa rede.

4. Guardar o ficheiro:
   - No `nano`: pressionar `Ctrl+O`, depois `Enter`, depois `Ctrl+X`
   - No `vim`: pressionar `ESC`, depois escrever `:wq` e pressionar `Enter`

### 🔍 Como descobrir o IP do PC1

No PC1, executar:

**Windows (PowerShell):**
```powershell
ipconfig
```
Procurar o endereço IPv4 da interface de rede ativa.

**Linux/macOS:**
```bash
ip addr show
# ou
ifconfig
```

---

## 2️⃣ Ligar o ZIG SIM ao Gateway

O **ZIG SIM** corre **fora do Docker**, diretamente no vosso PC.

### Configuração do ZIG SIM

Configure o ZIG SIM para enviar os dados do sensor para:

```
http://pc-kafka:5000/
```

### 📤 Formato do pedido

O ZIG SIM deve fazer pedidos **HTTP POST** para `http://pc-kafka:5000/` com um JSON no seguinte formato:

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

### ✅ Resposta esperada

Quando o sensor-gateway recebe e processa com sucesso, devolve:

```json
{
  "status": "ok",
  "received": {
    "id": 1,
    "ocupado": true,
    "timestamp": "2025-12-11T19:22:06.190Z"
  }
}
```

---

## 3️⃣ Arrancar o Sistema no PC1

### Pré-requisitos

- Docker e Docker Compose instalados
- Estar na pasta do projeto

### Comandos para arrancar

Abrir um terminal/PowerShell e executar:

```bash
cd PC1
docker compose up --build
```

Este comando vai:

1. ✅ Construir a imagem do **sensor-gateway**
2. ✅ Iniciar o **Zookeeper** (porta 2181)
3. ✅ Iniciar o **Kafka** (porta 9092, hostname `pc-kafka`)
4. ✅ Iniciar o **sensor-gateway** (porta 8000)
5. ✅ Iniciar o **Kafka UI** (porta 8080) - Interface web para monitorizar o Kafka

### 📊 Logs

Vão aparecer logs de todos os serviços no terminal. Procurar por mensagens como:

```
sensor-gateway  | INFO:     Uvicorn running on http://0.0.0.0:5000
sensor-gateway  | INFO:     Sensor-gateway ready!
kafka           | [KafkaServer id=1] started
kafka-ui        | Started Kafbat UI
```

### 🌐 Aceder ao Kafka UI

Após arrancar o sistema, podes monitorizar o Kafka através da interface web:

**Abrir no browser:**
```
http://localhost:8080
```

ou noutros PCs (após configurar o hosts):
```
http://pc-kafka:8080
```

**No Kafka UI podes:**
- 📋 Ver todos os tópicos (incluindo `sensor.raw`)
- 📨 Visualizar mensagens em tempo real
- 📈 Monitorizar o estado do cluster
- 🔍 Pesquisar e filtrar mensagens
- 📊 Ver estatísticas de consumo

### 🛑 Parar o sistema

Para parar todos os serviços:

```bash
# No terminal onde está a correr, pressionar:
Ctrl+C

# Para remover os containers:
docker compose down
```

---

## 4️⃣ Testar o Sistema

### 🔍 Teste 1: Health Check do Gateway

Verificar se o sensor-gateway está ativo:

```bash
curl http://pc-kafka:5000/health
```

**Resposta esperada:**
```json
{
  "status": "healthy",
  "kafka_bootstrap": "pc-kafka:9092",
  "kafka_topic": "sensor.raw"
}
```

### 📨 Teste 2: Enviar dados de teste (simulando o ZIG SIM)

**Windows (PowerShell):**
```powershell
$body = @{
  device = @{
    name = "Test Device"
    displayheight = 2208
    uuid = "TEST123"
    os = "ios"
    osversion = "18.5"
    displaywidth = 1242
  }
  timestamp = "2025_12_11_19:22:06.190"
  sensordata = @{
    proximitymonitor = @{
      proximitymonitor = $true
    }
  }
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://pc-kafka:5000/" -Method POST -Body $body -ContentType "application/json"
```

**Linux/macOS/Git Bash:**
```bash
curl -X POST http://pc-kafka:5000/ \
  -H "Content-Type: application/json" \
  -d '{
    "device": {
      "name": "Test Device",
      "displayheight": 2208,
      "uuid": "TEST123",
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
  }'
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "received": {
    "id": 1,
    "ocupado": true,
    "timestamp": "2025-12-11T19:22:06.190Z"
  }
}
```

### 📥 Teste 3: Verificar mensagens no Kafka

**Opção A - Kafka UI (Recomendado 🌟):**

Abrir o browser em `http://localhost:8080`:
1. Clicar em **Topics** no menu lateral
2. Clicar no tópico **sensor.raw**
3. Clicar em **Messages** para ver as mensagens em tempo real

**Opção B - Console Consumer (Terminal):**

```bash
docker exec -it kafka kafka-console-consumer \
  --bootstrap-server pc-kafka:9092 \
  --topic sensor.raw \
  --from-beginning
```

**Saída esperada:**
```json
{"id": 1, "ocupado": true, "timestamp": "2025-12-11T19:22:06.190Z"}
{"id": 1, "ocupado": false, "timestamp": "2025-12-11T19:23:10.500Z"}
```

> 💡 **Dica**: Para sair do consumidor, pressionar `Ctrl+C`

### 🔧 Teste 4: Listar tópicos Kafka

Verificar que o tópico `sensor.raw` foi criado:

```bash
docker exec -it kafka kafka-topics \
  --bootstrap-server pc-kafka:9092 \
  --list
```

Deverá aparecer `sensor.raw` na lista.

---

## 🎯 Resumo dos Endpoints

| Serviço | Endpoint | Porta | Descrição |
|---------|----------|-------|-----------|
| Sensor Gateway | `http://pc-kafka:8000/` | 8000 | Recebe dados do adapter HTTP (POST) |
| Sensor Gateway | `http://pc-kafka:8000/health` | 8000 | Health check (GET) |
| Kafka UI | `http://pc-kafka:8080` | 8080 | Interface web para monitorizar Kafka |
| Kafka | `pc-kafka:9092` | 9092 | Broker Kafka |
| Zookeeper | `pc-kafka:2181` | 2181 | Coordenação Kafka |

---

## ❓ Resolução de Problemas

### Problema: "Could not resolve host: pc-kafka"

**Solução**: Verificar se adicionou a entrada no ficheiro hosts corretamente (ver secção 1).

### Problema: Gateway não arranca ou dá erro de conexão ao Kafka

**Solução**: 
1. Verificar se o Kafka está a correr: `docker ps`
2. Ver logs do Kafka: `docker logs kafka`
3. Reiniciar os serviços: `docker compose restart`

### Problema: ZIG SIM não consegue enviar dados

**Solução**:
1. Verificar conectividade: `ping pc-kafka`
2. Testar com curl (ver Teste 2)
3. Verificar firewall do PC1 (porta 5000 deve estar aberta)

---

## 📞 Suporte

Se tiverem problemas, verificar:
1. Logs do sensor-gateway: `docker logs sensor-gateway`
2. Logs do Kafka: `docker logs kafka`
3. Conectividade de rede entre PCs

---

**Última atualização**: 2025-12-11
