"""
AetherNet MCP Security Engine
Enforces host system security policies:
- SAFE MODE: Strictly prohibits root, sudo, and privilege escalation commands.
- ROOT MODE: Policy violation checks are completely disabled. All root and administrative commands are permitted.
"""

import re
from typing import Tuple

# Root privilege escalation patterns prohibited in SAFE MODE
PRIVILEGE_PATTERNS = [
    r"\bsudo\b",
    r"\bsu\b",
    r"\bdoas\b",
    r"\bpkexec\b",
    r"\bgksu\b",
    r"\bgksudo\b",
    r"\bsu-to-root\b",
    r"\brun0\b",
    r"/etc/sudoers",
    r"/etc/shadow",
    r">+\s*/etc/(?:sudoers|shadow|passwd)",
    r"\bchown\s+(?:-R\s+)?root\b",
]

COMPILED_PRIVILEGE = [re.compile(p, re.IGNORECASE) for p in PRIVILEGE_PATTERNS]

def validate_command_safety(command: str, allow_root: bool = False) -> Tuple[bool, str]:
    """
    Validates whether a shell command is safe to execute on the local host.
    - If allow_root is True: Policy violation checks are completely disabled.
    - If allow_root is False: Prohibits root privilege escalation ('sudo', 'su', etc.).
    Returns (is_safe, error_message).
    """
    cmd_clean = command.strip()
    
    if not cmd_clean:
        return False, "Command cannot be empty."

    # In ROOT MODE, all policy checks are completely disabled
    if allow_root:
        return True, ""

    # SAFE MODE: Prohibit root privilege escalation
    for pattern in COMPILED_PRIVILEGE:
        if pattern.search(cmd_clean):
            return (
                False,
                f"SecurityViolation: Command execution rejected in SAFE MODE. Root privilege escalation ('sudo', 'su') is prohibited.\nTo allow root execution, toggle 'MCP : ROOT MODE' in the header.\nRejected command: '{cmd_clean}'"
            )

    # Check for direct sudo/su prefix
    first_token = cmd_clean.split()[0].lower()
    if first_token in ["sudo", "su", "doas", "pkexec"]:
        return (
            False,
            f"SecurityViolation: '{first_token}' is not allowed in SAFE MODE. Toggle 'MCP : ROOT MODE' in the header to permit sudo execution."
        )

    return True, ""
