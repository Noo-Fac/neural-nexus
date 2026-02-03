const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const WebSocket = require('ws');
const http = require('http');
const https = require('https');

// ===== NEXUS ALARM SYSTEM - Telegram Notifications =====
// DISABLED by default - use WebSocket for real-time sync instead
const TELEGRAM_BOT_TOKEN = '7977554413:AAFa2FQEXI6b5bTdFgWwS_QsOprbjb2tvZc';
const TELEGRAM_CHAT_ID = '6814413391';
const NEXUS_URL = 'https://nexus.noospherefactotum.com';

// Toggle for Telegram notifications - set to true to re-enable
const TELEGRAM_ALERTS_ENABLED = false;

/**
 * Send Telegram notification
 * @param {string} type - Notification type (New Task, New Note, Task Moved, New Comment)
 * @param {string} content - Content preview
 * @param {string} from - Who made the change (default: Gene)
 */
function sendTelegramNotification(type, content, from = 'Gene') {
  // Skip if Telegram alerts are disabled
  if (!TELEGRAM_ALERTS_ENABLED) {
    console.log(`🔕 Telegram notification skipped (disabled): ${type}`);
    return;
  }
  const message = `🚨 NEXUS ALERT

Type: ${type}
From: ${from}
Content: ${content}

View: ${NEXUS_URL}`;

  const payload = JSON.stringify({
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
    disable_web_page_preview: false
  });

  const options = {
    hostname: 'api.telegram.org',
    port: 443,
    path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode === 200) {
        console.log(`🔔 Telegram notification sent: ${type}`);
      } else {
        console.error('❌ Telegram notification failed:', data);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Telegram notification error:', error.message);
  });

  req.write(payload);
  req.end();
}
// =======================================================

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
let mainAgentWs = null; // Track the main agent connection

wss.on('connection', (ws, req) => {
  clients.add(ws);
  
  // Check if this is the main agent connecting
  const isMainAgent = req.headers['x-agent-type'] === 'main' || 
                      req.url.includes('agent=main');
  
  if (isMainAgent && !mainAgentWs) {
    mainAgentWs = ws;
    ws.isMainAgent = true;
    console.log('🤖 Main agent connected via WebSocket');
    
    // Update status to monitoring
    db.run(
      `UPDATE agent_status SET status = 'monitoring', current_task = 'Listening via WebSocket', last_active = CURRENT_TIMESTAMP WHERE id = 1`,
      [],
      function(err) {
        if (!err) {
          db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
            if (!err && row) {
              broadcast({ type: 'status', data: row });
            }
          });
        }
      }
    );
  }
  
  // Send current status on connection
  db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
    if (!err && row) {
      ws.send(JSON.stringify({ type: 'connected', data: { status: row, isMainAgent: ws.isMainAgent || false } }));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    
    // If main agent disconnected, update status back to idle
    if (ws.isMainAgent) {
      mainAgentWs = null;
      console.log('🤖 Main agent disconnected from WebSocket');
      
      db.run(
        `UPDATE agent_status SET status = 'idle', current_task = NULL, last_active = CURRENT_TIMESTAMP WHERE id = 1`,
        [],
        function(err) {
          if (!err) {
            db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
              if (!err && row) {
                broadcast({ type: 'status', data: row });
              }
            });
          }
        }
      );
    }
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
        
        // 🔔 Send Telegram notification
        sendTelegramNotification('New Task', title, created_by || 'Gene');
        
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
          
          // 🔔 Send Telegram notification for status change
          sendTelegramNotification('Task Moved', `"${row.title}" → ${status}`, 'Gene');
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

// SUB-AGENTS API

// Sub-agents table
db.run(`CREATE TABLE IF NOT EXISTS sub_agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  task TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_ping DATETIME DEFAULT CURRENT_TIMESTAMP,
  session_id TEXT
)`);

// Get all sub-agents
app.get('/api/subagents', (req, res) => {
  db.all('SELECT * FROM sub_agents ORDER BY started_at DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Register sub-agent
app.post('/api/subagents', (req, res) => {
  const { name, task, session_id } = req.body;
  const id = uuidv4();
  
  db.run(
    `INSERT INTO sub_agents (id, name, task, session_id, status) VALUES (?, ?, ?, ?, 'working')`,
    [id, name, task, session_id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM sub_agents WHERE id = ?', [id], (err, row) => {
        broadcast({ type: 'subagent_update', data: row });
        res.status(201).json(row);
      });
    }
  );
});

// Update sub-agent ping
app.post('/api/subagents/:id/ping', (req, res) => {
  db.run(
    'UPDATE sub_agents SET last_ping = CURRENT_TIMESTAMP, status = ? WHERE id = ?',
    [req.body.status || 'working', req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Pong' });
    }
  );
});

// Update sub-agent status
app.post('/api/subagents/:id/status', (req, res) => {
  const { status, task } = req.body;
  db.run(
    'UPDATE sub_agents SET status = ?, task = ?, last_ping = CURRENT_TIMESTAMP WHERE id = ?',
    [status, task, req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM sub_agents WHERE id = ?', [req.params.id], (err, row) => {
        broadcast({ type: 'subagent_update', data: row });
        res.json(row);
      });
    }
  );
});

// Complete sub-agent
app.post('/api/subagents/:id/complete', (req, res) => {
  db.run(
    'UPDATE sub_agents SET status = ?, last_ping = CURRENT_TIMESTAMP WHERE id = ?',
    ['completed', req.params.id],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      db.get('SELECT * FROM sub_agents WHERE id = ?', [req.params.id], (err, row) => {
        broadcast({ type: 'subagent_complete', data: row });
        res.json(row);
      });
    }
  );
});

// Cleanup old sub-agents
app.delete('/api/subagents/old', (req, res) => {
  db.run(
    "DELETE FROM sub_agents WHERE status = 'completed' OR datetime(last_ping) < datetime('now', '-1 hour')",
    [],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: 'Old sub-agents cleaned up', count: this.changes });
    }
  );
});

// Status auto-update - check inactivity every 30 seconds
const INACTIVITY_TIMEOUT = 5 * 60 * 1000; // 5 minutes

setInterval(() => {
  db.get('SELECT * FROM agent_status WHERE id = 1', (err, row) => {
    if (err || !row) return;
    
    const lastActive = new Date(row.last_active);
    const now = new Date();
    const inactive = now - lastActive > INACTIVITY_TIMEOUT;
    
    if (inactive && row.status === 'working') {
      db.run(
        "UPDATE agent_status SET status = 'idle' WHERE id = 1",
        [],
        function(err) {
          if (!err) {
            db.get('SELECT * FROM agent_status WHERE id = 1', (err, updatedRow) => {
              if (!err && updatedRow) {
                broadcast({ type: 'status', data: updatedRow });
                console.log('🤖 Status auto-updated: WORKING → IDLE (inactivity)');
              }
            });
          }
        }
      );
    }
  });
  
  // Also check sub-agents for timeout
  db.run(
    "UPDATE sub_agents SET status = 'idle' WHERE status = 'working' AND datetime(last_ping) < datetime('now', '-10 minutes')",
    [],
    function(err) {
      if (!err && this.changes > 0) {
        broadcast({ type: 'subagent_timeout', count: this.changes });
      }
    }
  );
}, 30000);

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
        
        // 🔔 Send Telegram notification
        const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
        sendTelegramNotification('New Note', preview, author || 'Gene');
        
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
        
        // 🔔 Send Telegram notification with task info
        db.get('SELECT title FROM tasks WHERE id = ?', [taskId], (err, taskRow) => {
          const taskTitle = taskRow ? taskRow.title : 'Unknown Task';
          const preview = content.length > 100 ? content.substring(0, 100) + '...' : content;
          sendTelegramNotification('New Comment', `On "${taskTitle}": ${preview}`, author || 'Gene');
        });
        
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

// Test Telegram notification
app.post('/api/test-notification', (req, res) => {
  const { type, content } = req.body;
  sendTelegramNotification(type || 'Test', content || 'Nexus Alarm System is working!', 'System');
  res.json({ message: 'Test notification sent' });
});

// Serve main app
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`🧠 Neural Nexus running on port ${PORT}`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`📡 WebSocket server active - waiting for main agent connection`);
  console.log(`🔕 Telegram alerts DISABLED (using WebSocket real-time sync)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  server.close();
  process.exit(0);
});