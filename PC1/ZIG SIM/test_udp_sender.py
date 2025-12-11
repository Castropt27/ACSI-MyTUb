#!/usr/bin/env python3
"""
Test UDP Sender - Simula o ZIG SIM enviando dados
"""
import socket
import json
import time
from datetime import datetime

def send_test_data(ocupado=True):
    """Envia dados de teste via UDP"""
    
    # Criar timestamp no formato do ZIG SIM
    now = datetime.now()
    timestamp = now.strftime("%Y_%m_%d_%H:%M:%S.") + f"{now.microsecond // 1000:03d}"
    
    # Dados de teste (mesmo formato do ZIG SIM)
    data = {
        "device": {
            "name": "Test Device (iPhone14,3)",
            "displayheight": 2208,
            "uuid": "TEST123ABC",
            "os": "ios",
            "osversion": "18.5",
            "displaywidth": 1242
        },
        "timestamp": timestamp,
        "sensordata": {
            "proximitymonitor": {
                "proximitymonitor": ocupado
            }
        }
    }
    
    # Enviar via UDP
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    message = json.dumps(data, indent=2)
    
    print("=" * 60)
    print(f"📤 Enviando dados via UDP para localhost:5000")
    print(f"📊 Ocupado: {ocupado}")
    print(f"⏰ Timestamp: {timestamp}")
    print("=" * 60)
    print(message)
    print("=" * 60)
    
    sock.sendto(message.encode('utf-8'), ("localhost", 5000))
    sock.close()
    
    print("✅ Enviado!")

if __name__ == "__main__":
    print("\n🧪 TEST UDP SENDER - Simulador ZIG SIM\n")
    
    while True:
        print("\nEscolhe uma opção:")
        print("1 - Enviar 'ocupado=true'")
        print("2 - Enviar 'ocupado=false'")
        print("3 - Enviar 5 mensagens alternadas (true/false)")
        print("0 - Sair")
        
        choice = input("\nOpção: ").strip()
        
        if choice == "1":
            send_test_data(ocupado=True)
        elif choice == "2":
            send_test_data(ocupado=False)
        elif choice == "3":
            for i in range(5):
                send_test_data(ocupado=(i % 2 == 0))
                print(f"\n⏳ Aguardando 2 segundos...\n")
                time.sleep(2)
            print("\n✅ 5 mensagens enviadas!")
        elif choice == "0":
            print("\n👋 Adeus!")
            break
        else:
            print("❌ Opção inválida!")
