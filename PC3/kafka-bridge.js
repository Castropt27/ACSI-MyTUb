const { Kafka } = require('kafkajs');
const WebSocket = require('ws');

// Configuração Kafka
const kafka = new Kafka({
    clientId: 'pc3-bridge',
    brokers: ['192.168.21.227:9093']
});

// Criar servidor WebSocket
const wss = new WebSocket.Server({ port: 3001 });
const consumer = kafka.consumer({ groupId: 'pc3-bridge-group' });

console.log('🚀 Iniciando ponte Kafka → WebSocket...');

// Quando cliente conecta
wss.on('connection', (ws) => {
    console.log('✅ Cliente WebSocket conectado');

    ws.on('close', () => {
        console.log('❌ Cliente WebSocket desconectado');
    });
});

// Conectar ao Kafka e consumir eventos
async function start() {
    try {
        await consumer.connect();
        console.log('✅ Conectado ao Kafka');

        // Subscrever tópicos
        await consumer.subscribe({
            topics: [
                'notifications.sessions',
                'notifications.irregularities'
            ],
            fromBeginning: false  // Só eventos novos
        });
        console.log('✅ Subscrito aos tópicos');

        // Processar mensagens
        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const event = JSON.parse(message.value.toString());
                    console.log(`📨 [${topic}] ${event.type}`);

                    // Enviar para todos os clientes WebSocket conectados
                    const payload = JSON.stringify({ topic, event });

                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(payload);
                        }
                    });
                } catch (err) {
                    console.error('Erro ao processar mensagem:', err);
                }
            }
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar ponte:', error);
        process.exit(1);
    }
}

// Tratamento de erros
consumer.on('consumer.crash', (event) => {
    console.error('💥 Consumidor crashed:', event.payload.error);
});

// Iniciar ponte
start().catch(console.error);

console.log('🌉 Ponte Kafka rodando em ws://localhost:3001');
