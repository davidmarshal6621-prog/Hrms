#!/usr/bin/env python3
"""
ZKTeco direct-pull script using pyzk.
Usage:
  python3 zk_sync.py <ip> <port>              -- fetch attendance records
  python3 zk_sync.py <ip> <port> --users      -- fetch user list
  python3 zk_sync.py <ip> <port> --test       -- probe device without changing it
Outputs JSON to stdout.
"""
import sys
import json
import re
from datetime import datetime

def main():
    if len(sys.argv) < 3:
        print(json.dumps({"error": "Usage: zk_sync.py <ip> <port> [--users]"}))
        sys.exit(1)

    ip = sys.argv[1]
    port = int(sys.argv[2])
    fetch_users = "--users" in sys.argv
    test_connection = "--test" in sys.argv
    set_device_time = "--set-time" in sys.argv
    add_device_user = "--add-user" in sys.argv

    operation_data = {}
    if set_device_time or add_device_user:
        try:
            operation_data = json.load(sys.stdin)
        except Exception:
            print(json.dumps({"error": "Operation input must be valid JSON"}))
            sys.exit(1)

    try:
        from zk import ZK
    except ImportError:
        print(json.dumps({"error": "pyzk not installed. Run: python3 -m pip install pyzk"}))
        sys.exit(1)

    real_stdout = sys.stdout
    sys.stdout = sys.stderr

    zk = ZK(ip, port=port, timeout=15, password=0, force_udp=False, ommit_ping=True)
    conn = None
    device_disabled = False
    result = None
    try:
        conn = zk.connect()
        if test_connection:
            result = {
                "success": True,
                "deviceName": conn.get_device_name(),
                "serialNumber": conn.get_serialnumber(),
                "firmwareVersion": conn.get_firmware_version(),
            }
        elif set_device_time:
            value = operation_data.get("dateTime", "")
            try:
                timestamp = datetime.strptime(value, "%Y-%m-%dT%H:%M")
            except (TypeError, ValueError):
                raise ValueError("Date/time must use YYYY-MM-DDTHH:MM")
            conn.set_time(timestamp)
            result = {"success": True, "deviceDateTime": value}
        elif add_device_user:
            user_id = str(operation_data.get("userId", "")).strip()
            name = str(operation_data.get("name", "")).strip()
            if not re.fullmatch(r"\d{1,9}", user_id):
                raise ValueError("Machine user ID must contain 1 to 9 digits")
            if not name or len(name) > 24:
                raise ValueError("Name must contain 1 to 24 characters")
            users = conn.get_users()
            existing = next((user for user in users if str(user.user_id) == user_id), None)
            if existing:
                raise ValueError(f"Machine user ID {user_id} already exists")
            uid = conn.next_uid
            conn.set_user(
                uid=uid,
                user_id=user_id,
                name=name,
                privilege=0,
                password="",
                group_id="",
                card=0,
            )
            result = {
                "success": True,
                "userId": user_id,
                "name": name,
                "updated": existing is not None,
            }
        elif not fetch_users and not test_connection and not set_device_time and not add_device_user:
            conn.disable_device()
            device_disabled = True

        if fetch_users and not test_connection:
            users = conn.get_users()
            users_result = []
            for u in users:
                users_result.append({
                    "userId": str(u.user_id),
                    "name": (u.name or "").strip(),
                    "privilege": u.privilege,
                    "password": u.password or "",
                })
            result = {"success": True, "count": len(users_result), "users": users_result}
        elif not test_connection and not set_device_time and not add_device_user:
            attendances = conn.get_attendance()
            records = []
            for att in attendances:
                records.append({
                    "enrollNumber": str(att.user_id),
                    "timestamp": att.timestamp.isoformat() if att.timestamp else None,
                    "punch": att.punch,
                    "status": att.status,
                })
            result = {"success": True, "count": len(records), "records": records}

    except Exception as e:
        result = {"error": str(e), "type": type(e).__name__}
    finally:
        if conn:
            if device_disabled:
                try:
                    conn.enable_device()
                except Exception as e:
                    if result is None:
                        result = {"error": f"Could not re-enable device: {e}"}
                    else:
                        result["reenableWarning"] = str(e)
            try:
                conn.disconnect()
            except Exception:
                pass
        sys.stdout = real_stdout

    print(json.dumps(result or {"error": "No result returned"}))
    if result and result.get("error"):
        sys.exit(1)

if __name__ == "__main__":
    main()
