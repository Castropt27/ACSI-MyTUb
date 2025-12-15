#!/usr/bin/env python3
"""
UDP to HTTP Adapter for ZIG SIM
================================
Receives sensor data via UDP (port 5000) from ZIG SIM app
and forwards it via HTTP POST to the sensor-gateway service.

Usage:
    python udp_to_http_adapter.py
"""

import socket
import json
import requests
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
UDP_HOST = "0.0.0.0"
UDP_PORT = 5000
HTTP_GATEWAY_URL = "http://localhost:8000/"

def main():
    """Main UDP server loop"""
    
    # Create UDP socket
    logger.info(f"Creating UDP socket on {UDP_HOST}:{UDP_PORT}")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.bind((UDP_HOST, UDP_PORT))
    
    logger.info(f"✅ UDP Adapter ready! Listening on port {UDP_PORT}")
    logger.info(f"📤 Will forward to: {HTTP_GATEWAY_URL}")
    logger.info("Waiting for ZIG SIM data...")
    logger.info("💡 Modo: Apenas mostrar mudanças de estado\n")
    
    message_count = 0
    last_state = None  # Track last sensor state
    
    while True:
        try:
            # Receive UDP data
            data, addr = sock.recvfrom(4096)
            message_count += 1
            
            # Decode the data
            raw_data = data.decode('utf-8')
            
            # Try to parse as JSON
            try:
                json_data = json.loads(raw_data)
                
                # Extract sensor state
                try:
                    current_state = json_data["sensordata"]["proximitymonitor"]["proximitymonitor"]
                    
                    # Only log if state changed
                    if current_state != last_state:
                        timestamp = datetime.now().strftime("%H:%M:%S")
                        if current_state:
                            logger.info(f"� [{timestamp}] SENSOR ATIVADO - Lugar Ocupado!")
                        else:
                            logger.info(f"🟢 [{timestamp}] SENSOR LIVRE - Lugar Livre!")
                        
                        last_state = current_state
                    
                except KeyError:
                    logger.warning(f"⚠️ JSON sem campo de sensor esperado")
                
                # Forward to HTTP gateway (always, even if state didn't change)
                try:
                    response = requests.post(
                        HTTP_GATEWAY_URL,
                        json=json_data,
                        timeout=5
                    )
                    
                    if response.status_code != 200:
                        logger.warning(f"⚠️ Gateway returned status {response.status_code}")
                        logger.warning(f"Response: {response.text}")
                        
                except requests.exceptions.ConnectionError:
                    logger.error("❌ Could not connect to gateway. Is Docker running?")
                    logger.error(f"   Tried to connect to: {HTTP_GATEWAY_URL}")
                except requests.exceptions.Timeout:
                    logger.error("❌ Gateway timeout (>5s)")
                except Exception as e:
                    logger.error(f"❌ HTTP error: {e}")
                    
            except json.JSONDecodeError as e:
                logger.warning(f"⚠️ Invalid JSON: {e}")
                logger.warning("Raw data will not be forwarded")
                
        except KeyboardInterrupt:
            logger.info("\n\n🛑 Stopping adapter...")
            break
        except Exception as e:
            logger.error(f"❌ Unexpected error: {e}")
            continue
    
    # Cleanup
    sock.close()
    logger.info("👋 Adapter stopped")

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("🚀 Starting UDP to HTTP Adapter for ZIG SIM")
    logger.info("=" * 60)
    main()
