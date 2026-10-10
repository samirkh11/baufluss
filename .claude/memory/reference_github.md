---
name: reference-github
description: Meisterwerk – GitHub-Repository-URL, Account, Push-Policy
metadata:
  type: reference
---

- Repository: https://github.com/VolkerBTMerch/meisterwerk (privat)
- Account: `VolkerBTMerch` (gh CLI bereits authentifiziert, Token-Scopes: gist, read:org, repo,
  workflow)
- Lokaler Pfad: `/home/volker/meisterwerk/`
- Lokale Git-Identität für dieses Repo (`git config user.*`, nur lokal, kein `--global`):
  `VolkerBTMerch` / `volker@bt-merchandising.de` — identisch zur Identität, die im
  Travel-Planner-Repo verwendet wird.
- **Push-Policy** (siehe [[project_dev_environment]]): Erst pushen, wenn eine neue Funktion lokal
  erfolgreich getestet wurde — nicht automatisch nach jedem Build.
