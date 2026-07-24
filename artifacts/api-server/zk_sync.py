#!/usr/bin/env python3
"""
ZKTeco direct-pull script using pyzk.
Usage:
  python3 zk_sync.py <ip> <port>              -- fetch attendance records
  python3 zk_sync.py <ip> <port> --users      -- fetch user list
Outputs JSON to stdout.
"""
import sys
import json

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: zk_sync.py <ip> <port> [--users]"}))
        sys.exit(1)

    ip = sys.argv[1]
    port = int(sys.argv[2])
    fetch_users = "--users" in sys.argv

    try:
        from zk import ZK
    except ImportError:
        print(json.dumps({"error": "pyzk not installed. Run: python3 -m pip install pyzk"}))
        sys.exit(1)

    # Silence pyzk's own stdout progress — redirect to stderr
    real_stdout = sys.stdout
    sys.stdout = sys.stderr

    zk = ZK(ip, port=port, timeout=15, password=0, force_udp=False, ommit_ping=True)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()

        if fetch_users:
            users = conn.get_users()
            result = []
            for u in users:
                result.append({
                    "userId": str(u.user_id),
                    "name": (u.name or "").strip(),
                    "privilege": u.privilege,
                    "password": u.password or "",
                })
            conn.enable_device()
            sys.stdout = real_stdout
            print(json.dumps({"success": True, "count": len(result), "users": result}))
        else:
            attendances = conn.get_attendance()
            records = []
            for att in attendances:
                records.append({
                    "enrollNumber": str(att.user_id),
                    "timestamp": att.timestamp.isoformat() if att.timestamp else None,
                    "punch": att.punch,
                    "status": att.status,
                })
            conn.enable_device()
            sys.stdout = real_stdout
            print(json.dumps({"success": True, "count": len(records), "records": records}))

    except Exception as e:
        sys.stdout = real_stdout
        print(json.dumps({"error": str(e), "type": type(e).__name__}))
        sys.exit(1)
    finally:
        if conn:
            try:
                conn.disconnect()
            except Exception:
                pass

if __name__ == "__main__":
    main()
