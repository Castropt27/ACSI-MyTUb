from kafka import KafkaConsumer
import json

consumer = KafkaConsumer(
    'sensor.raw',
    bootstrap_servers=['pc-kafka:9092'],
    auto_offset_reset='earliest',
    group_id='kubik-consumer-group',
    value_deserializer=lambda x: json.loads(x.decode('utf-8'))
)

print("🔄 À espera de mensagens...")
for message in consumer:
    data = message.value
    print(f"📨 ID={data['id']}, Ocupado={data['ocupado']}, TS={data['timestamp']}")