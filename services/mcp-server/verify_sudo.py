#!/usr/bin/env python3
"""
AetherNet Sudo Password Verifier
Securely verifies the host user's sudo password without locking the PAM faillock account.
"""

import sys
import subprocess

def verify_sudo(password: str) -> bool:
    if not password:
        return False

    try:
        # Reset any faillock entries so the user account is not locked out
        try:
            subprocess.run(["faillock", "--reset"], capture_output=True, timeout=2)
        except Exception:
            pass

        # Clear cached sudo timestamp
        try:
            subprocess.run(["sudo", "-k"], capture_output=True, timeout=2)
        except Exception:
            pass

        # Validate password using sudo -S -p '' true
        res = subprocess.run(
            ["sudo", "-S", "-p", "", "true"],
            input=f"{password}\n",
            capture_output=True,
            text=True,
            timeout=6
        )

        if res.returncode == 0:
            return True

        # On failure, clear faillock counter so the user can re-try without a 10-minute lock
        try:
            subprocess.run(["faillock", "--reset"], capture_output=True, timeout=2)
        except Exception:
            pass

        return False
    except Exception:
        return False

def main():
    if len(sys.argv) > 1 and sys.argv[1] != "-":
        pwd = sys.argv[1]
    else:
        pwd = sys.stdin.read().rstrip("\r\n")

    if verify_sudo(pwd):
        print("OK")
        sys.exit(0)
    else:
        print("FAIL")
        sys.exit(1)

if __name__ == "__main__":
    main()
