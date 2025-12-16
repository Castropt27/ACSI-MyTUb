"""
MyTUB Backend API - Complete REST API for Clients and Fiscals
Provides endpoints for parking sessions, fines management, and real-time updates
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import RealDictCursor
import os
import logging
import json
import uuid
import base64
from kafka import KafkaProducer
import asyncio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="MyTUB Backend API", version="2.0.0", description="Backend API for parking management system")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
db_config = {
    "host": os.getenv("DB_HOST", "postgres"),
    "port": os.getenv("DB_PORT", "5432"),
    "database": os.getenv("DB_NAME", "sensor_data"),
    "user": os.getenv("DB_USER", "backend"),
    "password": os.getenv("DB_PASSWORD", "backend123")
}

# Kafka configuration
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "192.168.21.227:9093")
kafka_producer = None
INFRACOES_TOPIC = os.getenv("INFRACOES_TOPIC", "infracoes")
NOTIF_IRREG_TOPIC = os.getenv("NOTIFICATIONS_IRREGULARITIES_TOPIC", "notifications.irregularities")

def get_kafka_producer():
    """Get or create Kafka producer"""
    global kafka_producer
    if kafka_producer is None:
        try:
            kafka_producer = KafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8')
            )
            logger.info(f"✅ Kafka producer initialized: {KAFKA_BOOTSTRAP_SERVERS}")
        except Exception as e:
            logger.warning(f"⚠️ Kafka not available: {e}")
    return kafka_producer

def get_db_connection():
    """Get database connection"""
    try:
        return psycopg2.connect(**db_config)
    except Exception as e:
        logger.error(f"Database connection error: {e}")
        raise HTTPException(status_code=500, detail="Database connection failed")

sent_irregularity_keys = set()

async def publish_irregularities_loop():
    """Every 5s, publish irregularities (>30s ocupado sem sessão) to Kafka."""
    interval_seconds = 5
    while True:
        try:
            conn = get_db_connection()
            try:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute(
                    """
                    SELECT spot_id, occupied_since, minutes_occupied
                    FROM irregularities
                    WHERE is_irregular = true AND minutes_occupied > 0.5
                    ORDER BY minutes_occupied DESC
                    """
                )
                rows = cursor.fetchall()
                cursor.close()
            finally:
                conn.close()

            producer = get_kafka_producer()
            now_iso = datetime.utcnow().isoformat()

            for row in rows:
                spot_id = str(row.get('spot_id'))
                occupied_since = row.get('occupied_since')
                if isinstance(occupied_since, datetime):
                    occupied_since_iso = occupied_since.isoformat()
                else:
                    occupied_since_iso = occupied_since or None

                key = f"{spot_id}:{occupied_since_iso}"
                if key in sent_irregularity_keys:
                    continue

                payload = {
                    'type': 'IRREGULARITY_DETECTED',
                    'spot_id': spot_id,
                    'ocupado': True,
                    'timestamp': now_iso,
                    'message': f'⚠️ Lugar {spot_id} ocupado sem sessão válida!'
                }

                if producer:
                    try:
                        producer.send(NOTIF_IRREG_TOPIC, payload)
                        sent_irregularity_keys.add(key)
                        logger.info(f"📢 Published irregularity to '{NOTIF_IRREG_TOPIC}': {payload}")
                    except Exception as e:
                        logger.warning(f"Failed to publish irregularity to Kafka: {e}")
                else:
                    logger.warning("Kafka producer unavailable; skipping irregularity publish")

        except Exception as e:
            logger.error(f"Irregularities loop error: {e}")

        await asyncio.sleep(interval_seconds)

@app.on_event("startup")
async def _start_irregularities_loop():
    asyncio.create_task(publish_irregularities_loop())

# WebSocket manager for real-time updates
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"📱 WebSocket client connected. Total: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"📱 WebSocket client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """Broadcast message to all connected clients"""
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to client: {e}")

manager = ConnectionManager()

# ============================================================================
# MODELS
# ============================================================================

class UserCreate(BaseModel):
    name: str
    email: Optional[str] = None
    role: str = Field(..., pattern="^(CLIENTE|FISCAL)$")
    fiscal_id: Optional[str] = None

class SessionCreate(BaseModel):
    spot_id: str
    user_name: str
    duration_minutes: int = Field(default=60, ge=15, le=480)
    amount_paid: Optional[float] = 0.0

class SessionExtend(BaseModel):
    additional_minutes: int = Field(..., ge=15, le=240)

class FineCreate(BaseModel):
    spot_id: str
    fiscal_id: str
    fiscal_name: str
    license_plate: str
    reason: str
    amount: float
    gps_lat: Optional[float] = None
    gps_lng: Optional[float] = None
    location_address: Optional[str] = None
    photo_base64: Optional[str] = None  # primary photo (kept for compatibility)
    photos: Optional[list[str]] = None  # multiple photos (base64 or URLs)
    notes: Optional[str] = None

class FineUpdate(BaseModel):
    status: str = Field(..., pattern="^(Emitida|Notificada|Paga|Em Recurso|Anulada)$")
    note: Optional[str] = None

# ============================================================================
# HEALTH & INFO
# ============================================================================

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "services": {
            "database": "connected",
            "kafka": "connected" if kafka_producer else "unavailable"
        }
    }

@app.get("/info")
async def system_info():
    """System information"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Count statistics
        cursor.execute("SELECT COUNT(*) as total FROM sensor_readings")
        readings_count = cursor.fetchone()["total"]
        
        cursor.execute("SELECT COUNT(*) as total FROM parking_sessions WHERE status = 'ACTIVE'")
        active_sessions = cursor.fetchone()["total"]
        
        cursor.execute("SELECT COUNT(*) as total FROM fines WHERE status != 'Anulada'")
        active_fines = cursor.fetchone()["total"]
        
        cursor.close()
        
        return {
            "system": "MyTUB Backend",
            "version": "2.0.0",
            "timestamp": datetime.utcnow().isoformat(),
            "statistics": {
                "total_readings": readings_count,
                "active_sessions": active_sessions,
                "active_fines": active_fines,
                "websocket_clients": len(manager.active_connections)
            }
        }
    finally:
        conn.close()

# ============================================================================
# CLIENT ENDPOINTS - PARKING SESSIONS
# ============================================================================

@app.post("/api/sessions", status_code=201)
async def create_session(session: SessionCreate):
    """Create a new parking session (CLIENT)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if spot is available (not occupied or no active session)
        cursor.execute("""
            SELECT ocupado FROM latest_sensor_readings WHERE sensor_id = %s
        """, (session.spot_id,))
        
        spot_data = cursor.fetchone()
        if not spot_data:
            raise HTTPException(status_code=404, detail="Spot not found")
        
        # Check for existing active session
        cursor.execute("""
            SELECT * FROM parking_sessions 
            WHERE spot_id = %s AND status = 'ACTIVE' AND end_time > NOW()
        """, (session.spot_id,))
        
        if cursor.fetchone():
            raise HTTPException(status_code=409, detail="Spot already has an active session")
        
        # Create session
        session_id = f"S{uuid.uuid4().hex[:12].upper()}"
        start_time = datetime.utcnow()
        end_time = start_time + timedelta(minutes=session.duration_minutes)
        
        cursor.execute("""
            INSERT INTO parking_sessions 
            (session_id, spot_id, user_name, start_time, end_time, amount_paid, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'ACTIVE')
            RETURNING *
        """, (session_id, session.spot_id, session.user_name, start_time, end_time, session.amount_paid))
        
        new_session = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        # Publish to Kafka
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send('session.events', {
                    'event': 'SESSION_CREATED',
                    'session_id': session_id,
                    'spot_id': session.spot_id,
                    'user_name': session.user_name,
                    'start_time': start_time.isoformat(),
                    'end_time': end_time.isoformat(),
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to publish to Kafka: {e}")
        
        # Broadcast via WebSocket
        await manager.broadcast({
            'type': 'SESSION_CREATED',
            'data': dict(new_session)
        })
        
        logger.info(f"✅ Session created: {session_id} for spot {session.spot_id}")
        return new_session
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session details by ID"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT *, 
                   CASE 
                       WHEN end_time < NOW() THEN 'EXPIRED'
                       ELSE status
                   END as current_status,
                   EXTRACT(EPOCH FROM (end_time - NOW())) / 60 as minutes_remaining
            FROM parking_sessions 
            WHERE session_id = %s
        """, (session_id,))
        
        session = cursor.fetchone()
        cursor.close()
        
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return session
    finally:
        conn.close()

@app.get("/api/sessions/spot/{spot_id}/active")
async def get_active_session_for_spot(spot_id: str):
    """Get active session for a specific spot"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT *, 
                   EXTRACT(EPOCH FROM (end_time - NOW())) / 60 as minutes_remaining
            FROM parking_sessions 
            WHERE spot_id = %s AND status = 'ACTIVE' AND end_time > NOW()
            ORDER BY start_time DESC
            LIMIT 1
        """, (spot_id,))
        
        session = cursor.fetchone()
        cursor.close()
        
        if not session:
            return {"has_active_session": False}
        
        return {"has_active_session": True, "session": session}
    finally:
        conn.close()

@app.put("/api/sessions/{session_id}/extend")
async def extend_session(session_id: str, extend: SessionExtend):
    """Extend parking session (CLIENT)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get current session
        cursor.execute("""
            SELECT * FROM parking_sessions 
            WHERE session_id = %s AND status = 'ACTIVE'
        """, (session_id,))
        
        session = cursor.fetchone()
        if not session:
            raise HTTPException(status_code=404, detail="Active session not found")
        
        # Check extension limit (max 3 extensions)
        if session["extended_times"] >= 3:
            raise HTTPException(status_code=400, detail="Maximum extensions reached (3)")
        
        # Update session
        new_end_time = session["end_time"] + timedelta(minutes=extend.additional_minutes)
        
        cursor.execute("""
            UPDATE parking_sessions 
            SET end_time = %s, 
                extended_times = extended_times + 1,
                updated_at = NOW()
            WHERE session_id = %s
            RETURNING *
        """, (new_end_time, session_id))
        
        updated_session = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        # Publish to Kafka
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send('session.events', {
                    'event': 'SESSION_EXTENDED',
                    'session_id': session_id,
                    'spot_id': updated_session['spot_id'],
                    'new_end_time': new_end_time.isoformat(),
                    'additional_minutes': extend.additional_minutes,
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to publish to Kafka: {e}")
        
        # Broadcast via WebSocket
        await manager.broadcast({
            'type': 'SESSION_EXTENDED',
            'data': dict(updated_session)
        })
        
        logger.info(f"✅ Session extended: {session_id} (+{extend.additional_minutes} min)")
        return updated_session
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error extending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.put("/api/sessions/{session_id}/end")
async def end_session(session_id: str):
    """End parking session early (CLIENT)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        cursor.execute("""
            UPDATE parking_sessions 
            SET status = 'COMPLETED',
                actual_end_time = NOW(),
                updated_at = NOW()
            WHERE session_id = %s AND status = 'ACTIVE'
            RETURNING *
        """, (session_id,))
        
        updated_session = cursor.fetchone()
        
        if not updated_session:
            raise HTTPException(status_code=404, detail="Active session not found")
        
        conn.commit()
        cursor.close()
        
        # Publish to Kafka
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send('session.events', {
                    'event': 'SESSION_ENDED',
                    'session_id': session_id,
                    'spot_id': updated_session['spot_id'],
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to publish to Kafka: {e}")
        
        # Broadcast via WebSocket
        await manager.broadcast({
            'type': 'SESSION_ENDED',
            'data': dict(updated_session)
        })
        
        logger.info(f"✅ Session ended: {session_id}")
        return updated_session
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error ending session: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/sessions/user/{user_name}/history")
async def get_user_session_history(user_name: str, limit: int = 50):
    """Get session history for a user (CLIENT)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM parking_sessions 
            WHERE user_name = %s
            ORDER BY start_time DESC
            LIMIT %s
        """, (user_name, limit))
        
        sessions = cursor.fetchall()
        cursor.close()
        
        return {
            "user_name": user_name,
            "total": len(sessions),
            "sessions": sessions
        }
    finally:
        conn.close()

# ============================================================================
# FISCAL ENDPOINTS - IRREGULARITIES & VERIFICATION
# ============================================================================

@app.get("/api/fiscal/spots")
async def get_all_spots_status():
    """Get status of all parking spots (FISCAL)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT 
                sr.sensor_id as spot_id,
                sr.ocupado,
                sr.timestamp as last_update,
                sr.gps_lat,
                sr.gps_lng,
                sr.rua,
                sr.zone,
                CASE 
                    WHEN EXISTS (
                        SELECT 1 FROM parking_sessions ps 
                        WHERE ps.spot_id = sr.sensor_id 
                        AND ps.status = 'ACTIVE' 
                        AND ps.end_time > NOW()
                    ) THEN true
                    ELSE false
                END as has_valid_session,
                (
                    SELECT session_id FROM parking_sessions ps 
                    WHERE ps.spot_id = sr.sensor_id 
                    AND ps.status = 'ACTIVE' 
                    AND ps.end_time > NOW()
                    ORDER BY start_time DESC
                    LIMIT 1
                ) as active_session_id,
                EXTRACT(EPOCH FROM (NOW() - sr.timestamp)) / 60 as minutes_since_change
            FROM latest_sensor_readings sr
            ORDER BY sr.sensor_id
        """)
        
        spots = cursor.fetchall()
        cursor.close()
        
        return {
            "timestamp": datetime.utcnow().isoformat(),
            "total_spots": len(spots),
            "spots": spots
        }
    finally:
        conn.close()

## Irregularities API removed: infractions are now Kafka-only via 'infracoes' topic

@app.get("/api/fiscal/verify/{spot_id}")
async def verify_spot(spot_id: str):
    """Verify if a spot has valid session (FISCAL)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get spot info
        cursor.execute("""
            SELECT 
                sr.sensor_id as spot_id,
                sr.ocupado,
                sr.timestamp as last_update,
                sr.gps_lat,
                sr.gps_lng,
                sr.rua,
                sr.zone,
                EXTRACT(EPOCH FROM (NOW() - sr.timestamp)) / 60 as minutes_occupied
            FROM latest_sensor_readings sr
            WHERE sr.sensor_id = %s
        """, (spot_id,))
        
        spot = cursor.fetchone()
        if not spot:
            raise HTTPException(status_code=404, detail="Spot not found")
        
        # Check for active session
        cursor.execute("""
            SELECT *, 
                   EXTRACT(EPOCH FROM (end_time - NOW())) / 60 as minutes_remaining
            FROM parking_sessions 
            WHERE spot_id = %s AND status = 'ACTIVE' AND end_time > NOW()
            ORDER BY start_time DESC
            LIMIT 1
        """, (spot_id,))
        
        active_session = cursor.fetchone()
        cursor.close()
        
        is_valid = active_session is not None
        is_irregular = spot['ocupado'] and not is_valid and spot['minutes_occupied'] > 5
        
        return {
            "spot_id": spot_id,
            "ocupado": spot['ocupado'],
            "has_valid_session": is_valid,
            "is_irregular": is_irregular,
            "minutes_occupied": round(spot['minutes_occupied'], 2),
            "location": {
                "gps_lat": float(spot['gps_lat']) if spot['gps_lat'] else None,
                "gps_lng": float(spot['gps_lng']) if spot['gps_lng'] else None,
                "rua": spot['rua'],
                "zone": spot['zone']
            },
            "active_session": dict(active_session) if active_session else None
        }
    finally:
        conn.close()

# ============================================================================
# FISCAL ENDPOINTS - FINES MANAGEMENT
# ============================================================================

@app.post("/api/fines", status_code=201)
async def create_fine(fine: FineCreate):
    """Create a new fine (FISCAL)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        fine_id = f"F{uuid.uuid4().hex[:12].upper()}"
        issue_timestamp = datetime.utcnow()
        
        # Create history entry
        history = [{
            "status": "Emitida",
            "timestamp": issue_timestamp.isoformat(),
            "action": "Coima criada",
            "fiscal_id": fine.fiscal_id
        }]
        
        cursor.execute("""
            INSERT INTO fines 
            (fine_id, spot_id, fiscal_id, fiscal_name, license_plate, issue_timestamp, status, 
             reason, amount, photo_url, photos, notes, gps_lat, gps_lng, location_address, history)
            VALUES (%s, %s, %s, %s, %s, %s, 'Emitida', %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING *
        """, (
            fine_id,
            fine.spot_id,
            fine.fiscal_id,
            fine.fiscal_name,
            fine.license_plate,
            issue_timestamp,
            fine.reason,
            fine.amount,
            fine.photo_base64,
            json.dumps(fine.photos) if fine.photos else None,
            fine.notes,
            fine.gps_lat,
            fine.gps_lng,
            fine.location_address,
            json.dumps(history)
        ))
        
        new_fine = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        # Publish to Kafka
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send('fine.events', {
                    'event': 'FINE_CREATED',
                    'fine_id': fine_id,
                    'spot_id': fine.spot_id,
                    'fiscal_id': fine.fiscal_id,
                    'amount': fine.amount,
                    'timestamp': issue_timestamp.isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to publish to Kafka: {e}")
        
        # Broadcast via WebSocket
        await manager.broadcast({
            'type': 'FINE_CREATED',
            'data': dict(new_fine)
        })
        
        # Send notification to client (if available)
        await manager.broadcast({
            'type': 'FINE_NOTIFICATION',
            'event': 'FINE_ISSUED',
            'fine_id': fine_id,
            'spot_id': fine.spot_id,
            'amount': fine.amount,
            'reason': fine.reason,
            'timestamp': issue_timestamp.isoformat(),
            'message': f'Coima emitida: {fine.reason}. Valor: €{fine.amount}'
        })
        
        logger.info(f"✅ Fine created: {fine_id} for spot {fine.spot_id}")
        return new_fine
        
    except Exception as e:
        conn.rollback()
        logger.error(f"Error creating fine: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/fines/{fine_id}")
async def get_fine(fine_id: str):
    """Get fine details by ID"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM fines WHERE fine_id = %s", (fine_id,))
        
        fine = cursor.fetchone()
        cursor.close()
        
        if not fine:
            raise HTTPException(status_code=404, detail="Fine not found")
        
        return fine
    finally:
        conn.close()

@app.put("/api/fines/{fine_id}")
async def update_fine_status(fine_id: str, update: FineUpdate):
    """Update fine status (FISCAL)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Get current fine
        cursor.execute("SELECT * FROM fines WHERE fine_id = %s", (fine_id,))
        fine = cursor.fetchone()
        
        if not fine:
            raise HTTPException(status_code=404, detail="Fine not found")
        
        # Update history
        history = fine['history'] if fine['history'] else []
        history.append({
            "status": update.status,
            "timestamp": datetime.utcnow().isoformat(),
            "action": f"Alterada de '{fine['status']}' para '{update.status}'",
            "note": update.note
        })
        
        cursor.execute("""
            UPDATE fines 
            SET status = %s, history = %s, updated_at = NOW()
            WHERE fine_id = %s
            RETURNING *
        """, (update.status, json.dumps(history), fine_id))
        
        updated_fine = cursor.fetchone()
        conn.commit()
        cursor.close()
        
        # Publish to Kafka
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send('fine.events', {
                    'event': 'FINE_UPDATED',
                    'fine_id': fine_id,
                    'old_status': fine['status'],
                    'new_status': update.status,
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to publish to Kafka: {e}")
        
        # Broadcast via WebSocket
        await manager.broadcast({
            'type': 'FINE_UPDATED',
            'data': dict(updated_fine)
        })
        
        logger.info(f"✅ Fine updated: {fine_id} → {update.status}")
        return updated_fine
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error updating fine: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/fines/{fine_id}")
async def delete_fine(fine_id: str):
    """Delete a fine (FISCAL)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        # Check if fine exists
        cursor.execute("SELECT * FROM fines WHERE fine_id = %s", (fine_id,))
        fine = cursor.fetchone()
        
        if not fine:
            raise HTTPException(status_code=404, detail="Fine not found")
        
        # Delete the fine
        cursor.execute("DELETE FROM fines WHERE fine_id = %s", (fine_id,))
        conn.commit()
        cursor.close()
        
        # Publish to Kafka
        producer = get_kafka_producer()
        if producer:
            try:
                producer.send('fine.events', {
                    'event': 'FINE_DELETED',
                    'fine_id': fine_id,
                    'spot_id': fine['spot_id'],
                    'timestamp': datetime.utcnow().isoformat()
                })
            except Exception as e:
                logger.warning(f"Failed to publish to Kafka: {e}")
        
        # Broadcast via WebSocket
        await manager.broadcast({
            'type': 'FINE_DELETED',
            'fine_id': fine_id,
            'spot_id': fine['spot_id']
        })
        
        logger.info(f"✅ Fine deleted: {fine_id}")
        return {
            "message": "Fine deleted successfully",
            "fine_id": fine_id,
            "deleted_at": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        logger.error(f"Error deleting fine: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.get("/api/fines/fiscal/{fiscal_id}")
async def get_fiscal_fines(fiscal_id: str, limit: int = 100):
    """Get fines issued by a specific fiscal"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM fines 
            WHERE fiscal_id = %s
            ORDER BY issue_timestamp DESC
            LIMIT %s
        """, (fiscal_id, limit))
        
        fines = cursor.fetchall()
        cursor.close()
        
        return {
            "fiscal_id": fiscal_id,
            "total": len(fines),
            "fines": fines
        }
    finally:
        conn.close()

@app.get("/api/fines/spot/{spot_id}")
async def get_spot_fines(spot_id: str):
    """Get all fines for a specific spot"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM fines 
            WHERE spot_id = %s
            ORDER BY issue_timestamp DESC
        """, (spot_id,))
        
        fines = cursor.fetchall()
        cursor.close()
        
        return {
            "spot_id": spot_id,
            "total": len(fines),
            "fines": fines
        }
    finally:
        conn.close()

@app.get("/api/fines")
async def get_all_fines(status: Optional[str] = None, limit: int = 100):
    """Get all fines, optionally filtered by status"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        
        if status:
            cursor.execute("""
                SELECT * FROM fines 
                WHERE status = %s
                ORDER BY issue_timestamp DESC
                LIMIT %s
            """, (status, limit))
        else:
            cursor.execute("""
                SELECT * FROM fines 
                ORDER BY issue_timestamp DESC
                LIMIT %s
            """, (limit,))
        
        fines = cursor.fetchall()
        cursor.close()
        
        return {
            "total": len(fines),
            "status_filter": status,
            "fines": fines
        }
    finally:
        conn.close()

# ============================================================================
# CLIENT ENDPOINTS - NOTIFICATIONS
# ============================================================================

@app.get("/api/client/{user_name}/notifications")
async def get_client_notifications(user_name: str):
    """Get active notifications for a client (session expiry, fines)"""
    conn = get_db_connection()
    try:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        notifications = []
        
        # Check for expired sessions
        cursor.execute("""
            SELECT session_id, spot_id, end_time 
            FROM parking_sessions 
            WHERE user_name = %s AND status = 'ACTIVE' AND end_time <= NOW()
        """, (user_name,))
        
        expired_sessions = cursor.fetchall()
        for session in expired_sessions:
            notifications.append({
                'type': 'SESSION_EXPIRED',
                'title': '⏰ Sessão Expirada',
                'message': f'Sua sessão no lugar {session["spot_id"]} expirou às {session["end_time"]}',
                'session_id': session['session_id'],
                'timestamp': datetime.utcnow().isoformat(),
                'priority': 'high'
            })
        
        # Check for fines issued
        cursor.execute("""
            SELECT fine_id, spot_id, reason, amount, issue_timestamp
            FROM fines 
            WHERE status = 'Emitida' 
            ORDER BY issue_timestamp DESC 
            LIMIT 10
        """)
        
        fines = cursor.fetchall()
        for fine in fines:
            notifications.append({
                'type': 'FINE_ISSUED',
                'title': '⚠️ Coima Emitida',
                'message': f'Coima emitida no lugar {fine["spot_id"]}: {fine["reason"]} (€{fine["amount"]})',
                'fine_id': fine['fine_id'],
                'amount': float(fine['amount']),
                'timestamp': fine['issue_timestamp'].isoformat(),
                'priority': 'critical'
            })
        
        cursor.close()
        
        return {
            'user_name': user_name,
            'total_notifications': len(notifications),
            'notifications': notifications
        }
    finally:
        conn.close()

@app.post("/api/client/{user_name}/notifications/acknowledge")
async def acknowledge_notification(user_name: str, notification_id: str):
    """Mark notification as read"""
    return {
        'acknowledged': True,
        'notification_id': notification_id,
        'timestamp': datetime.utcnow().isoformat()
    }

# ============================================================================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive and listen for ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)

# ============================================================================
# STARTUP
# ============================================================================

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    logger.info("🚀 MyTUB Backend API starting...")
    get_kafka_producer()
    logger.info("✅ Backend API ready!")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
