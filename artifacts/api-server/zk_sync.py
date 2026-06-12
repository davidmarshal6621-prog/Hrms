#!/usr/bin/env python3
"""
ZKTeco direct-pull script using pyzk.
Usage: python3 zk_sync.py <ip> <port>
Outputs JSON array of attendance records to stdout.
"""
import sys
import json
from datetime import datetime

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: zk_sync.py <ip> <port>"}))
        sys.exit(1)

    ip = sys.argv[1]
    port = int(sys.argv[2])

    try:
        from zk import ZK, const
    except ImportError:
        print(json.dumps({"error": "pyzk not installed. Run: python3 -m pip install pyzk"}))
        sys.exit(1)

    zk = ZK(ip, port=port, timeout=10, password=0, force_udp=False, ommit_ping=False)
    conn = None
    try:
        conn = zk.connect()
        conn.disable_device()

        attendances = conn.get_attendance()
        records = []
        for att in attendances:
            # att.user_id = enroll number (string)
            # att.timestamp = datetime object
            # att.punch = 0 (check-in) or 1 (check-out), or other values
            # att.status = 0 (check-in) 1 (check-out) 4 (break-out) etc.
            records.append({
                "enrollNumber": str(att.user_id),
                "timestamp": att.timestamp.isoformat() if att.timestamp else None,
                "punch": att.punch,
                "status": att.status,
            })

        conn.enable_device()
        print(json.dumps({"success": True, "count": len(records), "records": records}))

    except Exception as e:
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
