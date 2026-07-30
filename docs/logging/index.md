# SmartHire Logging

Stack: Pino (structured JSON logs) + Promtail (Docker log collector) + Loki (log storage, 3-day retention) + Grafana (dashboard).

## Files

| File | Description |
|------|-------------|
| [setup-prod.md](setup-prod.md) | Deploy logging stack for production (`/opt/smarthire/app`) |
| [setup-develop.md](setup-develop.md) | Deploy logging stack for development (`/opt/smarthire/app-develop`) |
| [how-to-query.md](how-to-query.md) | LogQL queries, architecture, format, retention, troubleshooting |

## Quick access

```
https://smart-hire.zen8labs.io/log   (production)
https://smart-hire-dev.zen8labs.io/log   (development)
```

Login: `admin` / `GRAFANA_ADMIN_PASSWORD` in `.env`