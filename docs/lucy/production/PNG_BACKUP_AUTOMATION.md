# Lucy PNG Backup Automation

- Codex automation ID: `back-up-lucy-png-masters`
- Project: `/Users/marcotiongson/skill-heaven`
- Schedule: hourly
- Execution: local
- Notifications: failed runs only
- Script: `scripts/assets/backup-lucy-pngs.sh`

The script discovers every PNG in the repository except `.git`, `node_modules`,
`dist`, and the backup itself. Each source is copied with `cp -p` to the same
relative path below `lucy-masters-backup/`. It does not hash, transform, rename,
delete, commit, or push anything. The destination is Git-ignored.

Run it manually at any time:

```bash
scripts/assets/backup-lucy-pngs.sh
```
