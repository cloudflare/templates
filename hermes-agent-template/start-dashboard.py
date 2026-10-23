"""Seed the demo configuration, then run the unmodified Hermes dashboard."""
import os
from pathlib import Path

import yaml

home = Path(os.environ["HERMES_HOME"])
home.mkdir(parents=True, exist_ok=True)
config = home / "config.yaml"
if not config.exists():
    config.write_text(yaml.safe_dump({
        "model": {"default": os.environ["MODEL"], "provider": "custom",
                  "base_url": os.environ["CUSTOM_BASE_URL"]},
        "platform_toolsets": {"cli": ["terminal", "file"]},
        "terminal": {"backend": "local", "cwd": "/workspace"},
        "agent": {"max_turns": 12},
    }))
os.execvp("hermes", ["hermes", "dashboard", "--host", "0.0.0.0", "--port", "9119", "--no-open", "--skip-build"])
