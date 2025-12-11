# 🧪 Guia de Teste do Sistema

## ✅ Status Atual

O Docker está a arrancar (Download das imagens: Zookeeper e Kafka)
Isto pode demorar 2-5 minutos na primeira vez.

---

## 📋 Passos de Teste

### ⏳ Passo 1: Aguardar o Docker terminar

Aguarda até veres esta mensagem no terminal do Docker:
```
sensor-gateway  | INFO:     Uvicorn running on http://0.0.0.0:5000
sensor-gateway  | INFO:     Sensor-gateway ready!
```

**Dica**: Se o download estiver muito lento, podes parar (`Ctrl+C`) e voltar a tentar.

---

### 🚀 Passo 2: Arrancar o Adapter UDP

**Numa NOVA janela PowerShell**, executa:

```powershell
cd "C:\Users\franc\OneDrive\Documentos\GitHub\ACSI-MyTUb\PC1\ZIG SIM"
python udp_to_http_adapter.py
```

Deves ver:
```
✅ UDP Adapter ready! Listening on port 5000
📤 Will forward to: http://localhost:8000/
Waiting for ZIG SIM data...
```

---

### 🧪 Passo 3: Enviar dados de teste

**Numa TERCEIRA janela PowerShell**, executa:

```powershell
cd "C:\Users\franc\OneDrive\Documentos\GitHub\ACSI-MyTUb\PC1\ZIG SIM"
python test_udp_sender.py
```

Vai aparecer um menu:
```
🧪 TEST UDP SENDER - Simulador ZIG SIM

Escolhe uma opção:
1 - Enviar 'ocupado=true'
2 - Enviar 'ocupado=false'
3 - Enviar 5 mensagens alternadas (true/false)
0 - Sair

Opção: 
```

**Escolhe opção 1** para enviar uma mensagem de teste.

---

### 👀 Passo 4: Ver o que acontece

Após enviar, deves ver:

**1️⃣ No terminal do test_udp_sender.py:**
```
✅ Enviado!
```

**2️⃣ No terminal do udp_to_http_adapter.py:**
```
============================================================
📨 Message #1 from 127.0.0.1:xxxxx
📥 Raw UDP data (234 bytes):
{...json do ZIG SIM...}
✅ Valid JSON received
✅ Forwarded to gateway successfully
📤 Gateway response: {'status': 'ok', 'received': {...}}
```

**3️⃣ No terminal do Docker:**
```
sensor-gateway  | INFO: Received data from ZIG SIM: {...}
sensor-gateway  | INFO: Transformed data: {...}
sensor-gateway  | INFO: Message sent to Kafka topic 'sensor.raw'
```

---

### 📊 Passo 5: Verificar mensagens no Kafka

**Numa QUARTA janela PowerShell**, executa:

```powershell
docker exec -it kafka kafka-console-consumer --bootstrap-server pc-kafka:9092 --topic sensor.raw --from-beginning
```

Deves ver as mensagens transformadas:
```json
{"id": 1, "ocupado": true, "timestamp": "2025-12-11T19:49:03.123Z"}
{"id": 1, "ocupado": false, "timestamp": "2025-12-11T19:49:10.456Z"}
```

Para sair do consumidor: `Ctrl+C`

---

## 🎯 Resumo das Janelas

Vais precisar de **4 janelas PowerShell**:

| Janela | Comando | Função |
|--------|---------|--------|
| 1 | `docker compose up --build` | Kafka + Gateway |
| 2 | `python udp_to_http_adapter.py` | Adapter UDP→HTTP |
| 3 | `python test_udp_sender.py` | Enviar dados teste |
| 4 | `docker exec -it kafka kafka-console-consumer...` | Ver Kafka |

---

## 🔧 Troubleshooting

### ❌ Adapter diz "Could not connect to gateway"

**Solução**: O Docker ainda não terminou de arrancar. Aguarda mais um pouco.

### ❌ "Address already in use" na porta 5000

**Solução**: Tens outro processo a usar a porta. Termina-o:
```powershell
# Ver o que está a usar a porta
netstat -ano | findstr :5000
```

### ❌ Nada aparece no Kafka

**Solução**: Verifica se todas as janelas estão a correr e tenta enviar novamente com opção 3 (5 mensagens).

---

## ✅ Teste com o ZIG SIM Real

Quando tudo funcionar com o script de teste, configura o **ZIG SIM** real:

**No telemóvel (app ZIG SIM):**
- Protocolo: **UDP**
- Host/IP: **`<IP do teu PC>`** (ex: `192.168.1.10`)
- Porta: **`5000`**
- Formato: **JSON**

Para descobrir o IP do teu PC:
```powershell
ipconfig
```
Procura o "Endereço IPv4" da tua rede Wi-Fi/Ethernet.

---

**Boa sorte com os testes! 🚀**
