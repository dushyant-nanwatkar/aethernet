#!/usr/bin/env python3
import sys
import json
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from server import handle_tool_call

def main():
    payload_raw = ""
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        payload_raw = sys.argv[1]
    else:
        payload_raw = sys.stdin.read()

    if not payload_raw.strip():
        print(json.dumps({"isError": True, "content": [{"type": "text", "text": "No tool arguments provided."}]}))
        sys.exit(1)
        
    try:
        data = json.loads(payload_raw)
        name = data.get("name", "")
        args = data.get("arguments", {})
        result = handle_tool_call(name, args)
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"isError": True, "content": [{"type": "text", "text": f"Runner Error: {str(e)}"}]}))
        sys.exit(1)

if __name__ == "__main__":
    main()
