import os
import json
import time
import logging
import requests
from kafka import KafkaConsumer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BOOTSTRAP = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'pc-kafka:9092')
TOPIC = os.getenv('KAFKA_FINES_TOPIC', 'notifications.fines')
GROUP_ID = os.getenv('KAFKA_GROUP_ID', 'fines-notifier')
WEBHOOK = os.getenv('FINES_WEBHOOK_URL')

if not WEBHOOK:
    logger.error('FINES_WEBHOOK_URL not set - notifier will not forward messages')


def forward_event(payload):
    try:
        headers = {'Content-Type': 'application/json'}
        resp = requests.post(WEBHOOK, json=payload, headers=headers, timeout=10)
        if resp.status_code >= 200 and resp.status_code < 300:
            logger.info('Forwarded fine %s to webhook', payload.get('fine_id'))
            return True
        else:
            logger.warning('Webhook returned status %s for fine %s', resp.status_code, payload.get('fine_id'))
            return False
    except Exception as e:
        logger.exception('Failed to forward fine to webhook: %s', e)
        return False


def main():
    logger.info('Connecting to Kafka %s, topic %s', BOOTSTRAP, TOPIC)
    consumer = KafkaConsumer(
        TOPIC,
        bootstrap_servers=BOOTSTRAP,
        group_id=GROUP_ID,
        auto_offset_reset='earliest',
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode('utf-8'))
    )

    logger.info('Listening for fine notifications...')
    for msg in consumer:
        try:
            payload = msg.value
            logger.info('Received message key=%s partition=%s offset=%s', msg.key, msg.partition, msg.offset)
            # Forward to configured webhook
            if WEBHOOK:
                ok = forward_event(payload)
                if not ok:
                    # simple retry once after short delay
                    time.sleep(2)
                    forward_event(payload)
        except Exception as e:
            logger.exception('Error processing message: %s', e)


if __name__ == '__main__':
    main()
