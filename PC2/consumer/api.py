"""
REST API for Sensor Data Analytics
Provides endpoints to query occupation data and statistics
"""

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Sensor Backend API", version="1.0.0")

# Database configuration
db_config = {
    "host": os.getenv("DB_HOST", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME", "sensor_data"),
    "user": os.getenv("DB_USER", "backend"),
    "password": os.getenv("DB_PASSWORD", "backend123")
}

def get_db_connection():
    """Get database connection"""
    try:
        return psycopg2.connect(**db_config)
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

# Response models
class SensorReading(BaseModel):
    id: int
    sensor_id: str
    ocupado: bool
    timestamp: str
    received_at: str

class OccupationEvent(BaseModel):
    sensor_id: str
    start_time: str
    end_time: str
    duration_minutes: float
    status: str  # "occupied" or "vacant"

class SensorStats(BaseModel):
    sensor_id: str
    total_readings: int
    current_status: str
    last_update: str
    occupancy_percentage: float
    average_vacant_time_minutes: float

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

@app.get("/sensors")
async def list_sensors():
    """List all unique sensor IDs"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT DISTINCT sensor_id FROM sensor_readings ORDER BY sensor_id")
        sensors = cursor.fetchall()
        cursor.close()
        return {"sensors": [s["sensor_id"] for s in sensors]}
    finally:
        conn.close()

@app.get("/readings/{sensor_id}")
async def get_readings(sensor_id: str, limit: int = 100):
    """Get latest readings for a sensor"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT id, sensor_id, ocupado, timestamp, received_at
            FROM sensor_readings
            WHERE sensor_id = %s
            ORDER BY timestamp DESC
            LIMIT %s
        """, (sensor_id, limit))
        readings = cursor.fetchall()
        cursor.close()
        
        return {
            "sensor_id": sensor_id,
            "count": len(readings),
            "readings": readings
        }
    finally:
        conn.close()

@app.get("/stats/{sensor_id}")
async def get_sensor_stats(sensor_id: str):
    """Get statistics for a sensor"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get total readings and current status
        cursor.execute("""
            SELECT 
                COUNT(*) as total_readings,
                (SELECT ocupado FROM sensor_readings 
                 WHERE sensor_id = %s ORDER BY timestamp DESC LIMIT 1) as current_status,
                (SELECT timestamp FROM sensor_readings 
                 WHERE sensor_id = %s ORDER BY timestamp DESC LIMIT 1) as last_update
            FROM sensor_readings
            WHERE sensor_id = %s
        """, (sensor_id, sensor_id, sensor_id))
        
        stats = cursor.fetchone()
        
        if not stats or stats["total_readings"] == 0:
            raise HTTPException(status_code=404, detail="Sensor not found")
        
        # Calculate occupancy percentage
        cursor.execute("""
            SELECT 
                COUNT(CASE WHEN ocupado = true THEN 1 END) as occupied_count,
                COUNT(*) as total_count
            FROM sensor_readings
            WHERE sensor_id = %s
        """, (sensor_id,))
        
        occupancy = cursor.fetchone()
        occupancy_pct = (occupancy["occupied_count"] / occupancy["total_count"] * 100) if occupancy["total_count"] > 0 else 0
        
        # Calculate average vacant time
        cursor.execute("""
            WITH vacant_periods AS (
                SELECT 
                    sensor_id,
                    timestamp,
                    ocupado,
                    LEAD(timestamp) OVER (PARTITION BY sensor_id ORDER BY timestamp) as next_timestamp,
                    LEAD(ocupado) OVER (PARTITION BY sensor_id ORDER BY timestamp) as next_ocupado
                FROM sensor_readings
                WHERE sensor_id = %s
            )
            SELECT 
                AVG(EXTRACT(EPOCH FROM (next_timestamp - timestamp)) / 60) as avg_vacant_minutes
            FROM vacant_periods
            WHERE ocupado = false AND next_ocupado = true
        """, (sensor_id,))
        
        vacant_time = cursor.fetchone()
        avg_vacant = vacant_time["avg_vacant_minutes"] if vacant_time["avg_vacant_minutes"] else 0
        
        cursor.close()
        
        return {
            "sensor_id": sensor_id,
            "total_readings": stats["total_readings"],
            "current_status": "occupied" if stats["current_status"] else "vacant",
            "last_update": stats["last_update"].isoformat() if stats["last_update"] else None,
            "occupancy_percentage": round(occupancy_pct, 2),
            "average_vacant_time_minutes": round(avg_vacant, 2)
        }
    finally:
        conn.close()

@app.get("/occupation-events/{sensor_id}")
async def get_occupation_events(sensor_id: str, limit: int = 50):
    """Get occupation/vacation events for a sensor"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            WITH events AS (
                SELECT 
                    sensor_id,
                    timestamp,
                    ocupado,
                    LEAD(timestamp) OVER (PARTITION BY sensor_id ORDER BY timestamp) as next_timestamp,
                    LEAD(ocupado) OVER (PARTITION BY sensor_id ORDER BY timestamp) as next_ocupado
                FROM sensor_readings
                WHERE sensor_id = %s
            )
            SELECT 
                sensor_id,
                timestamp as start_time,
                next_timestamp as end_time,
                EXTRACT(EPOCH FROM (next_timestamp - timestamp)) / 60 as duration_minutes,
                CASE WHEN ocupado = true THEN 'occupied' ELSE 'vacant' END as status
            FROM events
            WHERE next_timestamp IS NOT NULL
            ORDER BY timestamp DESC
            LIMIT %s
        """, (sensor_id, limit))
        
        events = cursor.fetchall()
        cursor.close()
        
        return {
            "sensor_id": sensor_id,
            "events_count": len(events),
            "events": [
                {
                    "start_time": e["start_time"].isoformat(),
                    "end_time": e["end_time"].isoformat() if e["end_time"] else None,
                    "duration_minutes": round(e["duration_minutes"], 2) if e["duration_minutes"] else 0,
                    "status": e["status"]
                }
                for e in events
            ]
        }
    finally:
        conn.close()

@app.get("/dashboard")
async def dashboard():
    """Dashboard with overview of all sensors"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            SELECT 
                sensor_id,
                COUNT(*) as total_readings,
                (SELECT ocupado FROM sensor_readings sr2 
                 WHERE sr2.sensor_id = sr.sensor_id 
                 ORDER BY timestamp DESC LIMIT 1) as current_status,
                (SELECT timestamp FROM sensor_readings sr2 
                 WHERE sr2.sensor_id = sr.sensor_id 
                 ORDER BY timestamp DESC LIMIT 1) as last_update
            FROM sensor_readings sr
            GROUP BY sensor_id
            ORDER BY sensor_id
        """)
        
        sensors = cursor.fetchall()
        cursor.close()
        
        dashboard_data = []
        for sensor in sensors:
            dashboard_data.append({
                "sensor_id": sensor["sensor_id"],
                "total_readings": sensor["total_readings"],
                "current_status": "occupied" if sensor["current_status"] else "vacant",
                "last_update": sensor["last_update"].isoformat() if sensor["last_update"] else None
            })
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "total_sensors": len(dashboard_data),
            "sensors": dashboard_data
        }
    finally:
        conn.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
