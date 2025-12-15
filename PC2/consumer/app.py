import json
import os
from kafka import KafkaConsumer
import psycopg2
from datetime import datetime
import time

bootstrap = os.getenv("BOOTSTRAP_SERVERS", "pc-kafka:9092")
topic = os.getenv("TOPIC", "sensor.raw")
group_id = os.getenv("GROUP_ID", "kubik-consumer")
auto_reset = os.getenv("AUTO_OFFSET_RESET", "earliest")

# Database configuration
db_config = {
    "host": os.getenv("DB_HOST", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME", "sensor_data"),
    "user": os.getenv("DB_USER", "backend"),
    "password": os.getenv("DB_PASSWORD", "backend123")
}

def get_db_connection():
    """Create database connection with retry logic"""
    max_retries = 5
    retry_delay = 2
    
    for attempt in range(max_retries):
        try:
            conn = psycopg2.connect(**db_config)
            print(f"✅ Connected to PostgreSQL database at {db_config['host']}")
            return conn
        except psycopg2.OperationalError as e:
            if attempt < max_retries - 1:
                print(f"⏳ Database connection attempt {attempt + 1} failed, retrying in {retry_delay}s...")
                time.sleep(retry_delay)
            else:
                print(f"❌ Failed to connect to database after {max_retries} attempts")
                raise

def save_to_database(conn, sensor_data):
    """Save sensor data to PostgreSQL"""
    try:
        cursor = conn.cursor()
        
        # Parse timestamp (format: 2025-12-11T19:22:06.190Z)
        timestamp_str = sensor_data.get('timestamp')
        timestamp = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        
        # Insert into database
        cursor.execute("""
            INSERT INTO sensor_readings (sensor_id, ocupado, timestamp, raw_data)
            VALUES (%s, %s, %s, %s)
        """, (
            sensor_data.get('id'),
            sensor_data.get('ocupado'),
            timestamp,
            json.dumps(sensor_data)
        ))
        
        conn.commit()
        cursor.close()
        return True
    except Exception as e:
        print(f"❌ Error saving to database: {e}")
        conn.rollback()
        return False

def main():
    # Connect to database
    db_conn = get_db_connection()
    
    # Connect to Kafka
    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=bootstrap,
        group_id=group_id,
        auto_offset_reset=auto_reset,
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    
    print(f"🔄 Listening on {topic} @ {bootstrap} (group={group_id})...")
    print(f"💾 Saving data to PostgreSQL database: {db_config['database']}")
    
    message_count = 0
    
    try:
        for msg in consumer:
            message_count += 1
            sensor_data = msg.value
            
            # Display message info
            print(f"📨 Message #{message_count} | offset={msg.offset} partition={msg.partition}")
            print(f"   📊 Sensor ID: {sensor_data.get('id')} | Ocupado: {sensor_data.get('ocupado')} | TS: {sensor_data.get('timestamp')}")
            
            # Save to database
            if save_to_database(db_conn, sensor_data):
                print(f"   ✅ Saved to database")
            else:
                print(f"   ⚠️  Failed to save to database")
            print()
            
    except KeyboardInterrupt:
        print("\n🛑 Shutting down consumer...")
    finally:
        consumer.close()
        db_conn.close()
        print(f"📊 Total messages processed: {message_count}")

if __name__ == "__main__":
    main()