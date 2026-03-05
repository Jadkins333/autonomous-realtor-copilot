# Dev Notes (macOS)

## Networking gotchas

- Web runs at `http://localhost:3000`.
- API runs at `http://localhost:8000`.
- iOS simulator can use `http://localhost:8000`.
- Physical devices must use LAN IP (example: `http://192.168.1.22:8000`).

## Reset DB + re-seed

```bash
docker compose down -v
pnpm dev:api
```

Seed/bootstrap runs from `apps/api/scripts/start_api.sh` on API container startup.

## Logs

Tail API logs:

```bash
docker compose logs --tail=120 api
```

Tail worker/beat logs:

```bash
docker compose logs --tail=120 worker beat
```

