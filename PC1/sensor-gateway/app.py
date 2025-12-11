import os
import json
from datetime import datetime
from fastapi import FastAPI, Request, HTTPException
from kafka import KafkaProducer
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(title="Sensor Gateway")

# Kafka configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "pc-kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "sensor.raw")

# Initialize Kafka producer
producer = None

def get_kafka_producer():
    """Initialize Kafka producer with retry logic"""
    global producer
    if producer is None:
        try:
            producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
                api_version=(0, 10, 1)
            )
            logger.info(f"Kafka producer initialized successfully. Bootstrap servers: {KAFKA_BOOTSTRAP_SERVERS}")
        except Exception as e:
            logger.error(f"Failed to initialize Kafka producer: {e}")
            raise
    return producer

def convert_timestamp(raw_timestamp: str) -> str:
    """
    Convert timestamp from format '2025_12_11_19:22:06.190'
    to ISO format '2025-12-11T19:22:06.190Z'
    """
    try:
        # Replace underscores with dashes for date part
        # Format: YYYY_MM_DD_HH:MM:SS.mmm -> YYYY-MM-DDTHH:MM:SS.mmmZ
        parts = raw_timestamp.split('_')
        if len(parts) == 4:
            date_part = f"{parts[0]}-{parts[1]}-{parts[2]}"
            time_part = parts[3]
            iso_timestamp = f"{date_part}T{time_part}Z"
            return iso_timestamp
        else:
            # Fallback to current time if format is unexpected
            logger.warning(f"Unexpected timestamp format: {raw_timestamp}")
            return datetime.utcnow().isoformat() + "Z"
    except Exception as e:
        logger.error(f"Error converting timestamp: {e}")
        return datetime.utcnow().isoformat() + "Z"

@app.post("/")
async def ingest_sensor_data(request: Request):
    """
    Receive sensor data from ZIG SIM, transform it, and send to Kafka.
    
    Expected input format:
    {
      "device": {...},
      "timestamp": "2025_12_11_19:22:06.190",
      "sensordata": {
        "proximitymonitor": {
          "proximitymonitor": true/false
        }
      }
    }
    
    Output to Kafka:
    {
      "id": 1,
      "ocupado": true/false,
      "timestamp": "2025-12-11T19:22:06.190Z"
    }
    """
    try:
        # Parse incoming JSON
        data = await request.json()
        logger.info(f"Received data from ZIG SIM: {json.dumps(data)}")
        
        # Extract required fields
        try:
            ocupado = data["sensordata"]["proximitymonitor"]["proximitymonitor"]
            raw_timestamp = data["timestamp"]
        except KeyError as e:
            logger.error(f"Missing required field: {e}")
            raise HTTPException(status_code=400, detail=f"Missing required field: {e}")
        
        # Convert timestamp to ISO format
        iso_timestamp = convert_timestamp(raw_timestamp)
        
        # Create output message
        output = {
            "id": 1,
            "ocupado": bool(ocupado),
            "timestamp": iso_timestamp
        }
        
        logger.info(f"Transformed data: {json.dumps(output)}")
        
        # Send to Kafka
        try:
            kafka_producer = get_kafka_producer()
            future = kafka_producer.send(KAFKA_TOPIC, value=output)
            # Wait for confirmation (with timeout)
            record_metadata = future.get(timeout=10)
            logger.info(
                f"Message sent to Kafka topic '{KAFKA_TOPIC}' "
                f"[partition: {record_metadata.partition}, offset: {record_metadata.offset}]"
            )
        except Exception as kafka_error:
            logger.error(f"Failed to send message to Kafka: {kafka_error}")
            raise HTTPException(status_code=500, detail=f"Failed to send to Kafka: {kafka_error}")
        
        # Return success response
        return {
            "status": "ok",
            "received": output
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {e}")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "kafka_bootstrap": KAFKA_BOOTSTRAP_SERVERS,
        "kafka_topic": KAFKA_TOPIC
    }

@app.on_event("startup")
async def startup_event():
    """Initialize Kafka producer on startup"""
    logger.info("Starting sensor-gateway service...")
    try:
        get_kafka_producer()
        logger.info("Sensor-gateway ready!")
    except Exception as e:
        logger.error(f"Failed to start: {e}")

@app.on_event("shutdown")
async def shutdown_event():
    """Close Kafka producer on shutdown"""
    global producer
    if producer:
        logger.info("Closing Kafka producer...")
        producer.close()
        logger.info("Kafka producer closed.")
