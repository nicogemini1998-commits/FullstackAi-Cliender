#!/usr/bin/env python3
"""
FullStackAI Terminal Bridge
Conecta el nodo de terminal de la web con el Mac local via WebSocket.
"""
import asyncio
import websockets
import subprocess
import os
import json
import hmac
import hashlib

HOST = "0.0.0.0"
PORT = 8765
SECRET = os.environ.get("BRIDGE_SECRET", "cliender_bridge_2024")

def sign(msg):
    return hmac.new(SECRET.encode(), msg.encode(), hashlib.sha256).hexdigest()

async def terminal_handler(websocket):
    print(f"🟢 Nodo conectado desde {websocket.remote_address}")
    try:
        async for raw in websocket:
            try:
                data = json.loads(raw)
                cmd = data.get("cmd", "")
                sig = data.get("sig", "")

                # Verificar firma (seguridad básica)
                if sig != sign(cmd):
                    await websocket.send(json.dumps({"err": "Firma inválida"}))
                    continue

                # Ejecutar comando
                proc = subprocess.Popen(
                    cmd,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    cwd=os.path.expanduser("~"),
                    text=True
                )
                stdout, stderr = proc.communicate(timeout=30)
                output = stdout or stderr or "Comando ejecutado (sin salida)"
                await websocket.send(json.dumps({"out": output, "code": proc.returncode}))

            except json.JSONDecodeError:
                # Fallback: comando plano sin firma
                proc = subprocess.Popen(
                    raw,
                    shell=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                    text=True
                )
                stdout, stderr = proc.communicate(timeout=30)
                output = stdout or stderr or "Sin salida"
                await websocket.send(output)

    except websockets.exceptions.ConnectionClosed:
        print("🔴 Nodo desconectado")

async def main():
    print(f"🚀 FullStackAI Terminal Bridge activo → ws://localhost:{PORT}")
    print(f"🔐 Secret: {SECRET[:8]}...")
    print("⏳ Esperando conexiones del nodo de terminal...")
    async with websockets.serve(terminal_handler, HOST, PORT):
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
