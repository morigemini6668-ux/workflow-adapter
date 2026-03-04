#!/usr/bin/env python
"""GitHub Copilot CLI 서버와 JSON-RPC 2.0으로 대화하는 스크립트."""

import argparse
import json
import os
import re
import socket
import sys
import time


def send_jsonrpc(sock, method, params, msg_id):
    """LSP-style framing으로 JSON-RPC 메시지를 전송한다."""
    payload = json.dumps({"jsonrpc": "2.0", "method": method, "params": params, "id": msg_id})
    payload_bytes = payload.encode("utf-8")
    header = f"Content-Length: {len(payload_bytes)}\r\n\r\n"
    sock.sendall(header.encode("ascii") + payload_bytes)


def recv_until(sock, stop_markers, timeout=30):
    """stop_markers 중 하나가 나타날 때까지 바이트 데이터를 수신한다."""
    sock.settimeout(2)
    data = b""
    end_time = time.time() + timeout
    while time.time() < end_time:
        try:
            chunk = sock.recv(8192)
            if not chunk:
                break
            data += chunk
            for marker in stop_markers:
                if marker.encode("utf-8") in data:
                    # 잔여 데이터 drain
                    sock.settimeout(0.5)
                    try:
                        while True:
                            extra = sock.recv(8192)
                            if not extra:
                                break
                            data += extra
                    except socket.timeout:
                        pass
                    return data
        except socket.timeout:
            continue
    return data


HEADER_PATTERN = re.compile(rb"Content-Length: (\d+)\r\n\r\n")


def parse_messages(raw_bytes):
    """바이트 데이터에서 JSON-RPC 메시지들을 파싱한다. Content-Length는 바이트 단위."""
    messages = []
    pos = 0
    while pos < len(raw_bytes):
        match = HEADER_PATTERN.search(raw_bytes, pos)
        if not match:
            break
        content_length = int(match.group(1))
        body_start = match.end()
        body_end = body_start + content_length
        if body_end > len(raw_bytes):
            break
        body_bytes = raw_bytes[body_start:body_end]
        try:
            messages.append(json.loads(body_bytes.decode("utf-8")))
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass
        pos = body_end
    return messages


def extract_assistant_text(messages):
    """메시지 목록에서 어시스턴트 응답 텍스트를 추출한다."""
    deltas = []
    full_content = None
    for msg in messages:
        event = msg.get("params", {}).get("event", {})
        etype = event.get("type", "")
        data = event.get("data", {})

        if etype == "assistant.message_delta":
            deltas.append(data.get("delta", ""))
        elif etype == "assistant.message":
            content = data.get("content")
            if content:
                full_content = content

    if full_content:
        return full_content
    if deltas:
        return "".join(deltas)
    return ""


def read_port(port_file):
    """포트 파일에서 포트 번호를 읽는다."""
    if not os.path.exists(port_file):
        print(f"Error: Port file not found: {port_file}", file=sys.stderr)
        sys.exit(1)
    with open(port_file, "r") as f:
        port_str = f.read().strip()
    try:
        return int(port_str)
    except ValueError:
        print(f"Error: Invalid port number in {port_file}: {port_str}", file=sys.stderr)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="GitHub Copilot CLI 서버에 메시지 전송")
    parser.add_argument("message", help="Copilot에게 보낼 메시지")
    parser.add_argument(
        "--port-file",
        default="copilot-server-port.conf",
        help="포트 번호가 기록된 파일 경로 (기본값: copilot-server-port.conf)",
    )
    parser.add_argument("--timeout", type=int, default=60, help="응답 대기 타임아웃(초)")
    args = parser.parse_args()

    port = read_port(args.port_file)

    # 소켓 연결 (IPv6 우선, 실패 시 IPv4 시도)
    sock = None
    for family in (socket.AF_INET6, socket.AF_INET):
        try:
            sock = socket.socket(family, socket.SOCK_STREAM)
            addr = "::1" if family == socket.AF_INET6 else "127.0.0.1"
            sock.connect((addr, port))
            break
        except (ConnectionRefusedError, OSError):
            sock.close()
            sock = None
            continue

    if sock is None:
        print(f"Error: Copilot server is not running on port {port}", file=sys.stderr)
        sys.exit(1)

    try:
        # Step 1: Ping
        send_jsonrpc(sock, "ping", {}, 1)
        raw = recv_until(sock, ["pong"], timeout=5)
        msgs = parse_messages(raw)
        pong = next((m for m in msgs if m.get("result", {}).get("message") == "pong"), None)
        if not pong:
            print("Error: Copilot server did not respond to ping", file=sys.stderr)
            sys.exit(1)

        # Step 2: Create session
        send_jsonrpc(sock, "session.create", {}, 2)
        raw = recv_until(sock, ["session.start"], timeout=10)
        msgs = parse_messages(raw)

        session_id = None
        for msg in msgs:
            event = msg.get("params", {}).get("event", {})
            if event.get("type") == "session.start":
                session_id = event.get("data", {}).get("sessionId")
                break
        if not session_id:
            for msg in msgs:
                sid = msg.get("params", {}).get("sessionId")
                if sid:
                    session_id = sid
                    break

        if not session_id:
            print("Error: Failed to create session", file=sys.stderr)
            sys.exit(1)

        # Step 3: Send message
        send_jsonrpc(sock, "session.send", {"sessionId": session_id, "prompt": args.message}, 3)

        # Step 4: Collect streaming response
        raw = recv_until(sock, ["session.idle"], timeout=args.timeout)
        msgs = parse_messages(raw)
        text = extract_assistant_text(msgs)

        if text:
            print(text)
        else:
            print("(No response received from Copilot)", file=sys.stderr)

    finally:
        sock.close()


if __name__ == "__main__":
    main()
