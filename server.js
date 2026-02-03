const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database setup
const db = new sqlite3.Database(path.join(__dirname, 'neural_nexus.db'));

db.serialize(() => {
  // Tasks table
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'backlog',
    priority TEXT DEFAULT 'medium',
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    tags TEXT
  )`);

  // Logs table
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id TEXT PRIMARY KEY,
    type TEXT,
    message TEXT,
    task_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  )`);

  // Documents table
  db.run(`CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    task_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  )`);

  // Agent status table
  db.run(`CREATE TABLE IF NOT EXISTS agent_status (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    status TEXT DEFAULT 'idle',
    current_task TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
    uptime_seconds INTEGER DEFAULT 0
  )`);

  // Initialize agent status
  db.run(`INSERT OR IGNORE INTO agent_status (id, status) VALUES (1, 'idle')`);

  // Notes table
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    author TEXT,
    seen BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Task comments table
  db.run(`CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY,
    task_id TEXT,
    content TEXT NOT NULL,
    author TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  )`);
});

// WebSocket for real-time updates
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  
  // Send current status on connection
  db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
    if (!err && row) {
      ws.send(JSON.stringify({ type: 'status', data: row }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
  });
});

function broadcast(data) {
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// API Routes

// Get agent status
app.get('/api/status', (req, res) => {
  db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// Update agent status
app.post('/api/status', (req, res) => {
  const { status, current_task } = req.body;
  db.run(
    `UPDATE agent_status SET status = ?, current_task = ?, last_active = CURRENT_TIMESTAMP WHERE id = 1`,
    [status, current_task],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
        broadcast({ type: 'status', data: row });
        res.json(row);
      });
    }
  );
});

// Get all tasks
app.get('/api/tasks', (req, res) => {
  db.all('SELECT * FROM tasks ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get tasks by status
app.get('/api/tasks/status/:status', (req, res) => {
  db.all('SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC', [req.params.status], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create task
app.post('/api/tasks', (req, res) => {
  const { title, description, priority, tags, created_by } = req.body;
  const id = uuidv4();
  
  db.run(
    `INSERT INTO tasks (id, title, description, priority, tags, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, title, description, priority || 'medium', tags, created_by],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM tasks WHERE id = ?', [id], (err, row) => {
        broadcast({ type: 'task_created', data: row });
        
        // Add log entry
        const logId = uuidv4();
        db.run(
          `INSERT INTO logs (id, type, message, task_id) VALUES (?, ?, ?, ?)`,
          [logId, 'task_created', `Task "${title}" created`, id]
        );
        
        res.status(201).json(row);
      });
    }
  );
});

// Update task
app.patch('/api/tasks/:id', (req, res) => {
  const { status, title, description, priority } = req.body;
  const taskId = req.params.id;
  
  let updates = [];
  let values = [];
  
  if (status) {
    updates.push('status = ?');
    values.push(status);
    if (status === 'completed') {
      updates.push('completed_at = CURRENT_TIMESTAMP');
    }
  }
  if (title) { updates.push('title = ?'); values.push(title); }
  if (description) { updates.push('description = ?'); values.push(description); }
  if (priority) { updates.push('priority = ?'); values.push(priority); }
  
  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(taskId);
  
  db.run(
    `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
    values,
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM tasks WHERE id = ?', [taskId], (err, row) => {
        broadcast({ type: 'task_updated', data: row });
        
        // Add log entry
        if (status) {
          const logId = uuidv4();
          db.run(
            `INSERT INTO logs (id, type, message, task_id) VALUES (?, ?, ?, ?)`,
            [logId, 'task_updated', `Task moved to ${status}`, taskId]
          );
        }
        
        res.json(row);
      });
    }
  );
});

// Delete task
app.delete('/api/tasks/:id', (req, res) => {
  const taskId = req.params.id;
  
  db.run('DELETE FROM tasks WHERE id = ?', [taskId], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    
    broadcast({ type: 'task_deleted', data: { id: taskId } });
    res.json({ message: 'Task deleted' });
  });
});

// Get logs
app.get('/api/logs', (req, res) => {
  const limit = req.query.limit || 50;
  db.all('SELECT * FROM logs ORDER BY created_at DESC LIMIT ?', [limit], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get logs for specific task
app.get('/api/logs/task/:taskId', (req, res) => {
  db.all('SELECT * FROM logs WHERE task_id = ? ORDER BY created_at DESC', [req.params.taskId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Add log entry
app.post('/api/logs', (req, res) => {
  const { type, message, task_id } = req.body;
  const id = uuidv4();
  
  db.run(
    `INSERT INTO logs (id, type, message, task_id) VALUES (?, ?, ?, ?)`,
    [id, type, message, task_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM logs WHERE id = ?', [id], (err, row) => {
        broadcast({ type: 'log_added', data: row });
        res.status(201).json(row);
      });
    }
  );
});

// Get documents
app.get('/api/documents', (req, res) => {
  db.all('SELECT * FROM documents ORDER BY updated_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get document by ID
app.get('/api/documents/:id', (req, res) => {
  db.get('SELECT * FROM documents WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Document not found' });
    res.json(row);
  });
});

// Create document
app.post('/api/documents', (req, res) => {
  const { title, content, task_id } = req.body;
  const id = uuidv4();
  
  db.run(
    `INSERT INTO documents (id, title, content, task_id) VALUES (?, ?, ?, ?)`,
    [id, title, content, task_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM documents WHERE id = ?', [id], (err, row) => {
        broadcast({ type: 'document_created', data: row });
        res.status(201).json(row);
      });
    }
  );
});

// Update document
app.patch('/api/documents/:id', (req, res) => {
  const { title, content } = req.body;
  const docId = req.params.id;
  
  db.run(
    `UPDATE documents SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [title, content, docId],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM documents WHERE id = ?', [docId], (err, row) => {
        broadcast({ type: 'document_updated', data: row });
        res.json(row);
      });
    }
  );
});

// NOTES API

// Get all notes
app.get('/api/notes', (req, res) => {
  db.all('SELECT * FROM notes ORDER BY created_at DESC LIMIT 50', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Get unseen notes
app.get('/api/notes/unseen', (req, res) => {
  db.all('SELECT * FROM notes WHERE seen = 0 ORDER BY created_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Create note
app.post('/api/notes', (req, res) => {
  const { content, author } = req.body;
  const id = uuidv4();
  
  db.run(
    `INSERT INTO notes (id, content, author) VALUES (?, ?, ?)`,
    [id, content, author],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM notes WHERE id = ?', [id], (err, row) => {
        broadcast({ type: 'note_added', data: row });
        res.status(201).json(row);
      });
    }
  );
});

// Mark note as seen
app.post('/api/notes/:id/seen', (req, res) => {
  db.run('UPDATE notes SET seen = 1 WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: 'Note marked as seen' });
  });
});

// TASK COMMENTS API

// Get comments for a task
app.get('/api/tasks/:taskId/comments', (req, res) => {
  db.all(
    'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC',
    [req.params.taskId],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});

// Add comment to task
app.post('/api/tasks/:taskId/comments', (req, res) => {
  const { content, author } = req.body;
  const taskId = req.params.taskId;
  const id = uuidv4();
  
  db.run(
    `INSERT INTO task_comments (id, task_id, content, author) VALUES (?, ?, ?, ?)`,
    [id, taskId, content, author],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM task_comments WHERE id = ?', [id], (err, row) => {
        broadcast({ type: 'comment_added', data: row });
        res.status(201).json(row);
      });
    }
  );
});

// Get single task
app.get('/api/tasks/:id', (req, res) => {
  db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Task not found' });
    res.json(row);
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Neural Nexus',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🧠 Neural Nexus running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  server.close();
  process.exit(0);
});