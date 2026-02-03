# Neural Nexus 🧠

**Noosphere Factotum Command Center**

A futuristic task management and collaboration hub for Gene and Noof (Noosphere Factotum).

## Features

- 🎯 **Kanban Task Board** - Track tasks across Backlog, In Progress, and Completed
- 📊 **Real-time Agent Status** - See if Noof is working or idle
- 📝 **Document Hub** - Store and manage project documents
- 📜 **System Logs** - Track all activities and changes
- 🎨 **Futuristic Glitch Theme** - Cyberpunk aesthetic matching the main website
- ⚡ **Real-time Updates** - WebSocket-powered live sync
- 💾 **Persistent Storage** - SQLite database

## Tech Stack

- **Backend:** Node.js + Express + SQLite3
- **Frontend:** Vanilla JS + CSS3 (no frameworks)
- **Real-time:** WebSocket
- **Theme:** Cyberpunk / Glitch / Neon

## API Endpoints

### Status
- `GET /api/status` - Get agent status
- `POST /api/status` - Update agent status

### Tasks
- `GET /api/tasks` - Get all tasks
- `GET /api/tasks/status/:status` - Get tasks by status
- `POST /api/tasks` - Create task
- `PATCH /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Logs
- `GET /api/logs` - Get system logs
- `POST /api/logs` - Add log entry

### Documents
- `GET /api/documents` - Get all documents
- `GET /api/documents/:id` - Get specific document
- `POST /api/documents` - Create document
- `PATCH /api/documents/:id` - Update document

## Deployment

```bash
# Install dependencies
npm install

# Start server
npm start

# Development with auto-reload
npm run dev
```

## Environment Variables

- `PORT` - Server port (default: 3000)

## License

MIT - Noosphere Factotum