import json
import os
from kafka import KafkaConsumer

bootstrap = os.getenv("BOOTSTRAP_SERVERS", "pc-kafka:9092")
topic = os.getenv("TOPIC", "sensor.raw")
group_id = os.getenv("GROUP_ID", "kubik-consumer")
auto_reset = os.getenv("AUTO_OFFSET_RESET", "earliest")

def main():
    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap,
        group_id=group_id,
        auto_offset_reset=auto_reset,
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    print(f"Listening on {topic} @ {bootstrap} (group={group_id})...")
    for msg in consumer:
        print(f"offset={msg.offset} partition={msg.partition} value={msg.value}")

if __name__ == "__main__":
    main()