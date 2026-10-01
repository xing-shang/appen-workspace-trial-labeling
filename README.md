# Appen Workspace Trial Labeling

Codex skill for Appen Workspace trial and formal quality-production tasks.

## Install

On the target computer, make sure GitHub access is available, then run:

```bash
python3 ~/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo xing-shang/appen-workspace-trial-labeling \
  --path appen-workspace-trial-labeling \
  --name appen-workspace-trial-labeling
```

This repository is private because the skill contains internal project workflow and delivery rules. Authenticate GitHub first if the installer cannot access the repository:

```bash
gh auth login
```

The skill will be installed at `~/.codex/skills/appen-workspace-trial-labeling` and becomes available to Codex on the next turn.
