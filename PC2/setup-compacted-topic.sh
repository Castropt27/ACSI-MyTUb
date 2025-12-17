#!/bin/bash
# Setup compacted topic for irregularities

# Wait for Kafka to be ready
echo "Waiting for Kafka..."
sleep 10

# Create or update the topic with compaction
echo "Configuring notifications.irregularities with cleanup.policy=compact..."

kafka-topics --bootstrap-server 192.168.21.227:9093 --topic notifications.irregularities \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.5 \
  --config segment.ms=60000 \
  --config delete.retention.ms=86400000 \
  --alter 2>/dev/null || \
kafka-topics --bootstrap-server 192.168.21.227:9093 --create \
  --topic notifications.irregularities \
  --partitions 1 \
  --replication-factor 1 \
  --config cleanup.policy=compact \
  --config min.cleanable.dirty.ratio=0.5 \
  --config segment.ms=60000 \
  --config delete.retention.ms=86400000

echo "✓ Topic configured with log compaction"
