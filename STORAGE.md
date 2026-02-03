# Persistent Storage Setup

## The Problem
SQLite database is stored inside the container at `/data/neural_nexus.db`. Without a volume mount, every deployment creates a fresh container and data is lost.

## The Solution
Mount a persistent volume to `/data` in Coolify.

## Coolify Configuration

1. Go to your Neural Nexus application in Coolify
2. Navigate to **Storage** tab
3. Add a new volume:
   - **Path in container**: `/data`
   - **Path on host**: `/var/lib/coolify/volumes/neural-nexus-data` (or any persistent path)
   - **Type**: Bind Mount

4. Save and redeploy

## Alternative: Docker Compose (if not using Coolify)

```yaml
version: '3.8'
services:
  neural-nexus:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - nexus-data:/data
    environment:
      - DATA_DIR=/data
      - PORT=3000

volumes:
  nexus-data:
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `/app/data` | Directory for SQLite database |
| `PORT` | `3000` | Server port |

## Data Location

- **With volume**: `/data/neural_nexus.db` (persisted)
- **Without volume**: `/app/data/neural_nexus.db` (lost on redeploy)
