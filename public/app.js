// Neural Nexus - Frontend Logic
const API_BASE = window.location.origin;

// WebSocket for real-time updates
let ws;
let reconnectInterval;

// Initialize
function init() {
    connectWebSocket();
    loadAllData();
    updateAgentStatus('working', 'Building Neural Nexus');
}

// WebSocket Connection
function connectWebSocket() {
    const wsUrl = window.location.origin.replace(/^http/, 'ws');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('🧠 Neural Nexus connected');
        addLog('system', 'Neural Nexus connection established');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => {
        console.log('Connection closed, reconnecting...');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'status':
            updateStatusUI(data.data);
            break;
        case 'task_created':
        case 'task_updated':
            loadTasks();
            addLog('task_updated', `Task "${data.data.title}" updated`);
            break;
        case 'task_deleted':
            loadTasks();
            addLog('task_deleted', 'Task deleted');
            break;
        case 'log_added':
            loadLogs();
            break;
        case 'document_created':
        case 'document_updated':
            loadDocuments();
            break;
    }
}

// Load all data
async function loadAllData() {
    await Promise.all([
        loadTasks(),
        loadLogs(),
        loadDocuments(),
        loadStats()
    ]);
}

// Tasks
async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/api/tasks`);
        const tasks = await response.json();
        
        // Clear all columns
        document.getElementById('backlogTasks').innerHTML = '';
        document.getElementById('progressTasks').innerHTML = '';
        document.getElementById('completedTasks').innerHTML = '';
        
        // Counters
        let backlogCount = 0;
        let progressCount = 0;
        let completedCount = 0;
        
        tasks.forEach(task => {
            const taskCard = createTaskCard(task);
            
            switch(task.status) {
                case 'backlog':
                    document.getElementById('backlogTasks').appendChild(taskCard);
                    backlogCount++;
                    break;
                case 'in-progress':
                    document.getElementById('progressTasks').appendChild(taskCard);
                    progressCount++;
                    break;
                case 'completed':
                    document.getElementById('completedTasks').appendChild(taskCard);
                    completedCount++;
                    break;
            }
        });
        
        // Update counters
        document.getElementById('backlogCount').textContent = backlogCount;
        document.getElementById('progressCount').textContent = progressCount;
        document.getElementById('completedCount').textContent = completedCount;
        document.getElementById('totalTasks').textContent = tasks.length;
        document.getElementById('inProgress').textContent = progressCount;
        document.getElementById('completed').textContent = completedCount;
        
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority}`;
    card.onclick = () => openTaskModal(task);
    
    const tags = task.tags ? task.tags.split(',').map(t => `<span class="tag">${t.trim()}</span>`).join('') : '';
    
    card.innerHTML = `
        <h4>${escapeHtml(task.title)}</h4>
        <p>${escapeHtml(task.description || '').substring(0, 100)}${task.description && task.description.length > 100 ? '...' : ''}</p>
        <div class="task-meta">
            <div class="task-tags">${tags}</div>
            <span class="task-date">${formatDate(task.created_at)}</span>
        </div>
    `;
    
    return card;
}

// Logs
async function loadLogs() {
    try {
        const response = await fetch(`${API_BASE}/api/logs?limit=20`);
        const logs = await response.json();
        
        const container = document.getElementById('logsContainer');
        container.innerHTML = '';
        
        logs.forEach(log => {
            const entry = document.createElement('div');
            entry.className = 'log-entry';
            
            let icon = 'fa-info-circle';
            if (log.type === 'task_created') icon = 'fa-plus-circle';
            if (log.type === 'task_updated') icon = 'fa-edit';
            if (log.type === 'status_change') icon = 'fa-sync';
            
            entry.innerHTML = `
                <span class="log-time">${formatTime(log.created_at)}</span>
                <span class="log-type ${log.type}"><i class="fas ${icon}"></i></span>
                <span class="log-message">${escapeHtml(log.message)}</span>
            `;
            
            container.appendChild(entry);
        });
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
        
    } catch (error) {
        console.error('Error loading logs:', error);
    }
}

function addLog(type, message) {
    // Add to UI immediately (will be persisted via API)
    fetch(`${API_BASE}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message })
    });
}

function clearLogs() {
    if (confirm('Clear all logs?')) {
        document.getElementById('logsContainer').innerHTML = '';
    }
}

// Documents
async function loadDocuments() {
    try {
        const response = await fetch(`${API_BASE}/api/documents`);
        const docs = await response.json();
        
        const container = document.getElementById('documentsList');
        container.innerHTML = '';
        
        docs.forEach(doc => {
            const item = document.createElement('div');
            item.className = 'document-item';
            item.onclick = () => openDocumentModal(doc);
            
            item.innerHTML = `
                <i class="fas fa-file-alt"></i>
                <div class="document-info">
                    <h4>${escapeHtml(doc.title)}</h4>
                    <p>${formatDate(doc.updated_at)}</p>
                </div>
            `;
            
            container.appendChild(item);
        });
        
        document.getElementById('totalDocs').textContent = docs.length;
        
    } catch (error) {
        console.error('Error loading documents:', error);
    }
}

// Agent Status
async function updateAgentStatus(status, currentTask) {
    try {
        await fetch(`${API_BASE}/api/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, current_task: currentTask })
        });
    } catch (error) {
        console.error('Error updating status:', error);
    }
}

function updateStatusUI(data) {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    
    indicator.className = `status-indicator ${data.status}`;
    text.textContent = data.status.toUpperCase();
}

// Modal Functions
function openTaskModal(task = null) {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    const title = document.getElementById('taskModalTitle');
    
    form.reset();
    
    if (task) {
        title.textContent = 'EDIT TASK';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskStatus').value = task.status;
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskTags').value = task.tags || '';
    } else {
        title.textContent = 'CREATE NEW TASK';
        document.getElementById('taskId').value = '';
    }
    
    modal.classList.add('active');
}

function closeTaskModal() {
    document.getElementById('taskModal').classList.remove('active');
}

async function saveTask() {
    const id = document.getElementById('taskId').value;
    const taskData = {
        title: document.getElementById('taskTitle').value,
        description: document.getElementById('taskDescription').value,
        status: document.getElementById('taskStatus').value,
        priority: document.getElementById('taskPriority').value,
        tags: document.getElementById('taskTags').value,
        created_by: 'Gene'
    };
    
    try {
        const url = id ? `${API_BASE}/api/tasks/${id}` : `${API_BASE}/api/tasks`;
        const method = id ? 'PATCH' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(taskData)
        });
        
        if (response.ok) {
            closeTaskModal();
            loadTasks();
        }
    } catch (error) {
        console.error('Error saving task:', error);
    }
}

// Document Modal
function openDocumentModal(doc = null) {
    const modal = document.getElementById('documentModal');
    const form = document.getElementById('documentForm');
    const title = document.getElementById('docModalTitle');
    
    form.reset();
    
    if (doc) {
        title.textContent = 'EDIT DOCUMENT';
        document.getElementById('docId').value = doc.id;
        document.getElementById('docTitle').value = doc.title;
        document.getElementById('docContent').value = doc.content || '';
    } else {
        title.textContent = 'NEW DOCUMENT';
        document.getElementById('docId').value = '';
    }
    
    modal.classList.add('active');
}

function closeDocumentModal() {
    document.getElementById('documentModal').classList.remove('active');
}

async function saveDocument() {
    const id = document.getElementById('docId').value;
    const docData = {
        title: document.getElementById('docTitle').value,
        content: document.getElementById('docContent').value
    };
    
    try {
        const url = id ? `${API_BASE}/api/documents/${id}` : `${API_BASE}/api/documents`;
        const method = id ? 'PATCH' : 'POST';
        
        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(docData)
        });
        
        if (response.ok) {
            closeDocumentModal();
            loadDocuments();
        }
    } catch (error) {
        console.error('Error saving document:', error);
    }
}

// Stats
async function loadStats() {
    // Stats are updated in loadTasks and loadDocuments
}

// Utilities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Close modals on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    }
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        openTaskModal();
    }
});

// Initialize on load
document.addEventListener('DOMContentLoaded', init);