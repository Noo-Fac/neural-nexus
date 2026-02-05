// Enhanced Neural Nexus with Drag & Drop, Notes, Threads, and Avatar States

const API_BASE = window.location.origin;
let ws;
let currentUser = 'Gene';
let currentTaskId = null;
let draggedTask = null;

// Track last viewed comment timestamps for notifications
let lastViewedComments = JSON.parse(localStorage.getItem('lastViewedComments') || '{}');

// Save to localStorage
function saveLastViewedComments() {
    localStorage.setItem('lastViewedComments', JSON.stringify(lastViewedComments));
}

// Check if task has new comments (comments added since last view)
function hasNewComments(task) {
    if (!task.comments || task.comments === 0) return false;
    const lastViewed = lastViewedComments[task.id];
    if (!lastViewed) {
        // Never viewed, show as new
        return true;
    }
    // Check if task has been updated since last view
    return new Date(task.updated_at) > new Date(lastViewed);
}

// Mark task comments as viewed
function markCommentsAsViewed(taskId) {
    lastViewedComments[taskId] = new Date().toISOString();
    saveLastViewedComments();
    // Reload tasks to update notification badges
    loadTasks();
}

// Avatar States
const AVATAR_STATES = {
    idle: { emoji: '😴', color: '#ff6600', label: 'IDLE' },
    monitoring: { emoji: '🧠', color: '#00f5ff', label: 'MONITORING' },
    working: { emoji: '🤖', color: '#00ff00', label: 'WORKING' },
    busy: { emoji: '⚡', color: '#ff00ff', label: 'BUSY' },
    bored: { emoji: '🥱', color: '#00f5ff', label: 'BORED' }
};

// Initialize
function init() {
    connectWebSocket();
    loadAllData();
    setupDragAndDrop();
    setupEventListeners();
    
    // Refresh sub-agents periodically
    setInterval(loadSubAgents, 10000);
    
    // Note: Status is now controlled by Noof only, not the UI
    // Status updates via /api/noof/status (authenticated)
    
    // Initialize Matrix Rain
    initMatrixRain();
    
    // Initialize random glitch effects
    initGlitchEffects();
    
    // Initialize 3D card tilt
    initCardTilt();
}

function connectWebSocket() {
    const wsUrl = window.location.origin.replace(/^http/, 'ws');
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('🧠 Neural Nexus connected');
        addLog('system', 'Connection established');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };

    ws.onclose = () => setTimeout(connectWebSocket, 3000);
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'status':
            updateAvatarState(data.data.status);
            break;
        case 'task_created':
        case 'task_updated':
        case 'task_deleted':
            loadTasks();
            break;
        case 'note_added':
        case 'note_deleted':
            loadNotes();
            checkForUnseenNotes();
            break;
        case 'subagent_update':
        case 'subagent_complete':
        case 'subagent_timeout':
            loadSubAgents();
            break;
        case 'comment_added':
        case 'comment_updated':
        case 'comment_deleted':
            // Refresh thread if it's currently open
            if (currentTaskId && data.data.task_id === currentTaskId) {
                openTaskThread(currentTaskId);
            }
            // Update comment count on task card
            loadTasks();
            break;
    }
}

// Avatar State Management
function updateAvatarState(status) {
    const state = AVATAR_STATES[status] || AVATAR_STATES.idle;
    const avatar = document.getElementById('noofAvatar');
    const statusText = document.getElementById('avatarStatus');
    const indicator = document.getElementById('statusIndicator');
    
    if (avatar) avatar.textContent = state.emoji;
    if (statusText) {
        statusText.textContent = state.label;
        statusText.style.color = state.color;
    }
    if (indicator) {
        indicator.style.background = state.color;
        indicator.style.boxShadow = `0 0 15px ${state.color}`;
    }
}

async function setAvatarState(status) {
    try {
        await fetch(`${API_BASE}/api/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        updateAvatarState(status);
    } catch (e) {
        console.error('Failed to update status:', e);
    }
}

// Navigation - Show Section
function showSection(section) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.textContent.toLowerCase().includes(section)) {
            item.classList.add('active');
        }
    });
    
    // For now, only tasks section is implemented
    // Documents, Analytics, Settings are coming soon
    if (section !== 'tasks') {
        alert(`${section.charAt(0).toUpperCase() + section.slice(1)} section coming soon!`);
        // Reset to tasks
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.textContent.toLowerCase().includes('task')) {
                item.classList.add('active');
            }
        });
    }
}

// Drag and Drop
function setupDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-tasks');
    
    columns.forEach(column => {
        column.addEventListener('dragover', handleDragOver);
        column.addEventListener('drop', handleDrop);
        column.addEventListener('dragleave', handleDragLeave);
    });
}

function handleDragStart(e, taskId) {
    draggedTask = taskId;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
    // Store task ID in multiple places for reliability
    e.dataTransfer.setData('taskId', taskId);
    console.log('Drag started:', taskId);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    // Clear drag-over from all columns
    document.querySelectorAll('.kanban-tasks').forEach(col => {
        col.classList.remove('drag-over');
    });
    draggedTask = null;
    console.log('Drag ended');
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    // Only remove if we're leaving the column, not entering a child
    if (!e.currentTarget.contains(e.relatedTarget)) {
        e.currentTarget.classList.remove('drag-over');
    }
}

async function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');
    
    // Try multiple ways to get the task ID
    let taskId = e.dataTransfer.getData('text/plain') || 
                 e.dataTransfer.getData('taskId') || 
                 draggedTask;
    
    if (!taskId) {
        console.error('No task ID found in drop');
        return;
    }
    
    const newStatus = e.currentTarget.dataset.status;
    console.log('Drop:', taskId, '→', newStatus);
    
    try {
        const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (response.ok) {
            console.log('Task moved successfully');
            addLog('task_moved', `Task moved to ${newStatus}`);
            // Reload tasks after a short delay to ensure state is updated
            setTimeout(() => loadTasks(), 100);
        } else {
            console.error('Failed to move task:', response.status);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            loadTasks(); // Reload to restore state
        }
    } catch (error) {
        console.error('Failed to move task:', error);
        loadTasks(); // Reload to restore state
    } finally {
        draggedTask = null;
    }
}

// Task Management
async function loadTasks() {
    try {
        const response = await fetch(`${API_BASE}/api/tasks`);
        const tasks = await response.json();

        const statusMap = {
            'backlog': 'backlogTasks',
            'in-progress': 'progressTasks',
            'completed': 'completedTasks'
        };

        const counterMap = {
            'backlog': 'backlogCount',
            'in-progress': 'progressCount',
            'completed': 'completedCount'
        };

        ['backlog', 'in-progress', 'completed'].forEach(status => {
            const container = document.getElementById(statusMap[status]);
            if (container) {
                container.innerHTML = '';
                const statusTasks = tasks.filter(t => t.status === status);
                statusTasks.forEach(task => container.appendChild(createTaskCard(task)));

                // Update counter
                const counter = document.getElementById(counterMap[status]);
                if (counter) counter.textContent = statusTasks.length;
            }
        });

        updateStats(tasks);

        // Populate tags filter after tasks are loaded
        populateTagsFilter();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = `task-card priority-${task.priority}`;
    card.draggable = true;
    card.dataset.taskId = task.id;
    
    // Use data attributes to store task data for safer event handling
    card.dataset.taskData = JSON.stringify(task);
    
    card.innerHTML = `
        <div class="task-header">
            <h4>${escapeHtml(task.title)}</h4>
            <div class="task-actions">
                <button class="thread-btn" data-task-id="${task.id}" title="View Thread" style="position: relative;">
                    <i class="fas fa-comments"></i>
                    ${hasNewComments(task) ? '<span class="notification-dot" style="position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; background: #ff4444; border-radius: 50%; border: 2px solid #0a0a0f;"></span>' : ''}
                </button>
                <button class="edit-btn" data-task-id="${task.id}" title="Edit">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="delete-btn" data-task-id="${task.id}" data-task-title="${escapeHtml(task.title).replace(/"/g, '&quot;')}" title="Delete Task" style="color: #ff4444;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        <p>${escapeHtml(task.description || '').substring(0, 100)}${task.description && task.description.length > 100 ? '...' : ''}</p>
        <div class="task-meta">
            <div class="task-tags">
                ${task.tags ? task.tags.split(',').map(t => `<span class="tag">${escapeHtml(t.trim())}</span>`).join('') : ''}
            </div>
            <span class="task-date">${formatDate(task.created_at)}</span>
        </div>
        ${task.comments ? `<div class="task-comments-count"><i class="fas fa-comment"></i> ${task.comments}</div>` : ''}
    `;
    
    // Add event listeners instead of inline onclick
    card.querySelector('.thread-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskThread(task.id);
    });
    
    card.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskModal(task);
    });
    
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteTask(task.id, task.title);
    });
    
    card.addEventListener('dragstart', (e) => handleDragStart(e, task.id));
    card.addEventListener('dragend', handleDragEnd);
    card.addEventListener('click', () => {
        // Handle focus mode
        if (focusModeActive) {
            // Remove focus from all tasks
            document.querySelectorAll('.task-card').forEach(c => c.classList.remove('focus-target'));
            // Add focus to clicked task
            card.classList.add('focus-target');
        }
        openTaskThread(task.id);
    });
    card.addEventListener('dblclick', () => openTaskThread(task.id));

    return card;
}

// Task Thread/Comments
async function openTaskThread(taskId) {
    currentTaskId = taskId;
    markCommentsAsViewed(taskId); // Mark as viewed when opening thread

    const task = await fetch(`${API_BASE}/api/tasks/${taskId}`).then(r => r.json());
    const comments = await fetch(`${API_BASE}/api/tasks/${taskId}/comments`).then(r => r.json());
    
    document.getElementById('threadTaskTitle').textContent = task.title;
    document.getElementById('threadTaskId').value = taskId;
    
    const container = document.getElementById('threadComments');
    container.innerHTML = '';
    
    comments.forEach(comment => {
        const div = document.createElement('div');
        div.className = `comment ${comment.author === 'Noof' ? 'noof' : 'gene'}`;
        div.dataset.commentId = comment.id;

        const canEdit = comment.author === currentUser;
        div.innerHTML = `
            <div class="comment-header">
                <strong>${comment.author}</strong>
                <span>${formatTime(comment.created_at)}</span>
                ${canEdit ? `
                <div class="comment-actions">
                    <button class="edit-comment-btn" data-comment-id="${comment.id}" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-comment-btn" data-comment-id="${comment.id}" title="Delete" style="color: #ff4444;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                ` : ''}
            </div>
            <p class="comment-content">${escapeHtml(comment.content)}</p>
        `;
        container.appendChild(div);

        // Add event listeners for edit and delete buttons
        if (canEdit) {
            const editBtn = div.querySelector('.edit-comment-btn');
            const deleteBtn = div.querySelector('.delete-comment-btn');

            editBtn.addEventListener('click', () => editComment(comment.id, comment.content));
            deleteBtn.addEventListener('click', () => deleteComment(comment.id));
        }
    });
    
    document.getElementById('threadModal').classList.add('active');
}

async function addComment() {
    const content = document.getElementById('commentInput').value;
    if (!content.trim()) return;
    
    try {
        await fetch(`${API_BASE}/api/tasks/${currentTaskId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, author: currentUser })
        });
        
        document.getElementById('commentInput').value = '';
        openTaskThread(currentTaskId);
        
        // If Gene adds comment, notify Noof
        if (currentUser === 'Gene') {
            notifyNoofOfComment(currentTaskId);
        }
    } catch (e) {
        console.error('Failed to add comment:', e);
    }
}

// Edit comment
async function editComment(commentId, currentContent) {
    const newContent = prompt('Edit your comment:', currentContent);
    if (newContent === null || newContent.trim() === '') return; // User cancelled or empty content

    try {
        await fetch(`${API_BASE}/api/tasks/${currentTaskId}/comments/${commentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newContent.trim() })
        });

        // Thread will be refreshed automatically via WebSocket
        addLog('success', 'Comment updated successfully');
    } catch (e) {
        console.error('Failed to edit comment:', e);
        addLog('error', 'Failed to edit comment');
    }
}

// Delete comment
async function deleteComment(commentId) {
    if (!confirm('Are you sure you want to delete this comment?')) return;

    try {
        await fetch(`${API_BASE}/api/tasks/${currentTaskId}/comments/${commentId}`, {
            method: 'DELETE'
        });

        // Thread will be refreshed automatically via WebSocket
        addLog('success', 'Comment deleted successfully');
    } catch (e) {
        console.error('Failed to delete comment:', e);
        addLog('error', 'Failed to delete comment');
    }
}

// Notes System
async function loadNotes() {
    try {
        const response = await fetch(`${API_BASE}/api/notes`);
        const notes = await response.json();
        
        const container = document.getElementById('notesList');
        if (!container) {
            console.error('notesList element not found');
            return;
        }
        container.innerHTML = '';
        
        notes.forEach(note => {
            const div = document.createElement('div');
            div.className = `note ${note.seen ? 'seen' : 'unseen'} ${note.author === 'Noof' ? 'noof' : 'gene'}`;
            div.innerHTML = `
                <div class="note-header">
                    <strong>${escapeHtml(note.author)}</strong>
                    <span>${formatTime(note.created_at)}</span>
                    <button class="delete-note-btn" data-note-id="${note.id}" title="Delete Note" style="color: #ff4444; background: none; border: none; cursor: pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                    ${note.seen ? '<span class="seen-badge"><i class="fas fa-check-double"></i> Seen</span>' : ''}
                </div>
                <p>${escapeHtml(note.content)}</p>
            `;
            
            // Add event listener for delete button
            div.querySelector('.delete-note-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                deleteNote(note.id);
            });
            
            container.appendChild(div);
            
            // Mark as seen if I'm Noof and it's from Gene
            if (!note.seen && note.author === 'Gene') {
                markNoteAsSeen(note.id);
            }
        });
        
        container.scrollTop = container.scrollHeight;
    } catch (e) {
        console.error('Failed to load notes:', e);
    }
}

async function addNote() {
    const content = document.getElementById('noteInput').value;
    if (!content.trim()) return;
    
    try {
        await fetch(`${API_BASE}/api/notes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content, author: currentUser })
        });
        
        document.getElementById('noteInput').value = '';
        loadNotes();
        
        // If Gene leaves note, notify me on Telegram
        if (currentUser === 'Gene') {
            notifyNoofOfNote(content);
        }
    } catch (e) {
        console.error('Failed to add note:', e);
    }
}

async function deleteNote(noteId) {
    if (!confirm('Are you sure you want to delete this note?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/notes/${noteId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadNotes();
            addLog('note_deleted', 'Note deleted');
        } else {
            alert('Failed to delete note');
        }
    } catch (error) {
        console.error('Error deleting note:', error);
        alert('Failed to delete note');
    }
}

async function markNoteAsSeen(noteId) {
    try {
        await fetch(`${API_BASE}/api/notes/${noteId}/seen`, { method: 'POST' });
    } catch (e) {
        console.error('Failed to mark note as seen:', e);
    }
}

async function checkForUnseenNotes() {
    try {
        const response = await fetch(`${API_BASE}/api/notes/unseen`);
        const unseen = await response.json();
        
        if (unseen.length > 0) {
            // Update UI to show notification
            const badge = document.getElementById('notesBadge');
            if (badge) {
                badge.textContent = unseen.length;
                badge.style.display = 'block';
            }
        }
    } catch (e) {
        console.error('Failed to check unseen notes:', e);
    }
}

// Document Editing
async function openDocumentEditor(docId = null) {
    const modal = document.getElementById('documentEditorModal');
    
    if (docId) {
        const doc = await fetch(`${API_BASE}/api/documents/${docId}`).then(r => r.json());
        document.getElementById('docEditId').value = doc.id;
        document.getElementById('docEditTitle').value = doc.title;
        document.getElementById('docEditContent').value = doc.content || '';
        document.getElementById('docEditorTitle').textContent = 'EDIT DOCUMENT';
    } else {
        document.getElementById('docEditId').value = '';
        document.getElementById('docEditTitle').value = '';
        document.getElementById('docEditContent').value = '';
        document.getElementById('docEditorTitle').textContent = 'NEW DOCUMENT';
    }
    
    modal.classList.add('active');
}

async function saveDocumentEdit() {
    const id = document.getElementById('docEditId').value;
    const title = document.getElementById('docEditTitle').value;
    const content = document.getElementById('docEditContent').value;
    
    if (!title.trim()) {
        alert('Please enter a title');
        return;
    }
    
    try {
        const url = id ? `${API_BASE}/api/documents/${id}` : `${API_BASE}/api/documents`;
        const method = id ? 'PATCH' : 'POST';
        
        await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, content })
        });
        
        closeDocumentEditor();
        loadDocuments();
        addLog(id ? 'document_updated' : 'document_created', `Document "${title}" ${id ? 'updated' : 'created'}`);
    } catch (e) {
        console.error('Failed to save document:', e);
    }
}

// Notification Functions
function notifyNoofOfNote(content) {
    // This would integrate with Telegram - placeholder for now
    console.log('📱 Would notify Noof on Telegram:', content.substring(0, 50));
}

function notifyNoofOfComment(taskId) {
    console.log('📱 Would notify Noof of comment on task:', taskId);
}

// Sub-Agent Tracking
async function loadSubAgents() {
    try {
        const response = await fetch(`${API_BASE}/api/subagents`);
        const agents = await response.json();
        
        const container = document.getElementById('subAgentsList');
        if (!container) return;
        
        container.innerHTML = '';
        
        const activeAgents = agents.filter(a => a.status === 'working' || a.status === 'idle');
        
        // Update counter
        const counter = document.getElementById('subAgentCount');
        if (counter) {
            counter.textContent = activeAgents.length;
        }
        
        if (activeAgents.length === 0) {
            container.innerHTML = '<div class="no-agents">No active sub-agents</div>';
            return;
        }
        
        activeAgents.forEach(agent => {
            const div = document.createElement('div');
            div.className = `sub-agent ${agent.status}`;
            
            const statusIcon = agent.status === 'working' ? '⚡' : '⏸️';
            const statusColor = agent.status === 'working' ? 'var(--neon-green)' : 'var(--neon-orange)';
            
            div.innerHTML = `
                <div class="sub-agent-header">
                    <span class="sub-agent-icon">🤖</span>
                    <span class="sub-agent-name">${escapeHtml(agent.name)}</span>
                    <span class="sub-agent-status" style="color: ${statusColor}">${statusIcon}</span>
                </div>
                <div class="sub-agent-task">${escapeHtml(agent.task || 'No task')}</div>
                <div class="sub-agent-meta">
                    <span>${formatTime(agent.started_at)}</span>
                </div>
            `;
            container.appendChild(div);
        });
    } catch (e) {
        console.error('Failed to load sub-agents:', e);
    }
}

async function registerSubAgent(name, task) {
    try {
        const sessionId = 'session_' + Date.now();
        const response = await fetch(`${API_BASE}/api/subagents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, task, session_id: sessionId })
        });
        
        if (response.ok) {
            const agent = await response.json();
            console.log('Sub-agent registered:', agent.id);
            loadSubAgents();
            return agent;
        }
    } catch (e) {
        console.error('Failed to register sub-agent:', e);
    }
}

async function updateSubAgentStatus(agentId, status, task) {
    try {
        await fetch(`${API_BASE}/api/subagents/${agentId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, task })
        });
        loadSubAgents();
    } catch (e) {
        console.error('Failed to update sub-agent:', e);
    }
}

async function completeSubAgent(agentId) {
    try {
        await fetch(`${API_BASE}/api/subagents/${agentId}/complete`, { method: 'POST' });
        loadSubAgents();
    } catch (e) {
        console.error('Failed to complete sub-agent:', e);
    }
}

// Setup Event Listeners
function setupEventListeners() {
    // Notes input - Enter to send
    const noteInput = document.getElementById('noteInput');
    if (noteInput) {
        noteInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addNote();
            }
        });
    }

    // Comment input - Enter to send
    const commentInput = document.getElementById('commentInput');
    if (commentInput) {
        commentInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                addComment();
            }
        });
    }

    // Search and Filters
    const taskSearch = document.getElementById('taskSearch');
    const filterPriority = document.getElementById('filterPriority');
    const filterTags = document.getElementById('filterTags');
    const focusModeToggle = document.getElementById('focusModeToggle');
    const clearFilters = document.getElementById('clearFilters');
    const clearSearch = document.getElementById('clearSearch');

    if (taskSearch) {
        taskSearch.addEventListener('input', filterTasks);
    }

    if (filterPriority) {
        filterPriority.addEventListener('change', filterTasks);
    }

    if (filterTags) {
        filterTags.addEventListener('change', filterTasks);
    }

    if (focusModeToggle) {
        focusModeToggle.addEventListener('click', toggleFocusMode);
    }

    if (clearFilters) {
        clearFilters.addEventListener('click', clearAllFilters);
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', () => {
            taskSearch.value = '';
            filterTasks();
        });
    }

    // Keyboard shortcut for quick add task (Ctrl+Shift+N)
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'N') {
            e.preventDefault();
            openTaskModal();
        }
    });
}

// ===== PRODUCTIVITY FEATURES =====

// Filter tasks based on search and dropdown selections
function filterTasks() {
    const searchTerm = document.getElementById('taskSearch')?.value.toLowerCase() || '';
    const priorityFilter = document.getElementById('filterPriority')?.value || '';
    const tagsFilter = document.getElementById('filterTags')?.value || '';

    // Get all task cards
    const taskCards = document.querySelectorAll('.task-card');

    taskCards.forEach(card => {
        const taskData = JSON.parse(card.dataset.taskData || '{}');
        let visible = true;

        // Search filter
        if (searchTerm) {
            const title = (taskData.title || '').toLowerCase();
            const description = (taskData.description || '').toLowerCase();
            const tags = (taskData.tags || '').toLowerCase();

            if (!title.includes(searchTerm) &&
                !description.includes(searchTerm) &&
                !tags.includes(searchTerm)) {
                visible = false;
            }
        }

        // Priority filter
        if (priorityFilter && taskData.priority !== priorityFilter) {
            visible = false;
        }

        // Tags filter
        if (tagsFilter) {
            const taskTags = (taskData.tags || '').split(',').map(t => t.trim().toLowerCase());
            if (!taskTags.includes(tagsFilter.toLowerCase())) {
                visible = false;
            }
        }

        // Apply visibility
        card.style.display = visible ? 'block' : 'none';
    });

    // Update task counts
    updateFilteredTaskCounts();
}

// Update task counts after filtering
function updateFilteredTaskCounts() {
    const columns = ['backlog', 'progress', 'completed'];
    columns.forEach(status => {
        const container = document.getElementById(`${status}Tasks`);
        if (container) {
            const visibleCount = container.querySelectorAll('.task-card[style="display: block"], .task-card:not([style*="display: none"])').length;
            const countEl = document.getElementById(`${status}Count`);
            if (countEl) {
                countEl.textContent = visibleCount;
            }
        }
    });
}

// Toggle focus mode
let focusModeActive = false;
function toggleFocusMode() {
    focusModeActive = !focusModeActive;
    const kanbanBoard = document.querySelector('.kanban-board');
    const focusBtn = document.getElementById('focusModeToggle');

    if (focusModeActive) {
        kanbanBoard.classList.add('focus-mode');
        focusBtn.classList.add('active');
        addLog('system', 'Focus mode enabled - click a task to focus');
    } else {
        kanbanBoard.classList.remove('focus-mode');
        focusBtn.classList.remove('active');
        // Remove focus target from all tasks
        document.querySelectorAll('.task-card').forEach(card => {
            card.classList.remove('focus-target');
        });
        addLog('system', 'Focus mode disabled');
    }
}

// Clear all filters
function clearAllFilters() {
    const taskSearch = document.getElementById('taskSearch');
    const filterPriority = document.getElementById('filterPriority');
    const filterTags = document.getElementById('filterTags');

    if (taskSearch) taskSearch.value = '';
    if (filterPriority) filterPriority.value = '';
    if (filterTags) filterTags.value = '';

    filterTasks();
    addLog('system', 'All filters cleared');
}

// Populate tags filter dynamically
function populateTagsFilter() {
    const tags = new Set();

    // Collect all unique tags from tasks
    document.querySelectorAll('.task-card').forEach(card => {
        const taskData = JSON.parse(card.dataset.taskData || '{}');
        const taskTags = (taskData.tags || '').split(',').filter(t => t.trim());
        taskTags.forEach(tag => tags.add(tag.trim()));
    });

    // Update the tags dropdown
    const filterTags = document.getElementById('filterTags');
    if (filterTags) {
        // Save current selection
        const currentValue = filterTags.value;

        // Clear options except the first one
        filterTags.innerHTML = '<option value="">All Tags</option>';

        // Add tags sorted alphabetically
        Array.from(tags).sort().forEach(tag => {
            if (tag) {
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = tag;
                filterTags.appendChild(option);
            }
        });

        // Restore selection if it still exists
        if (tags.has(currentValue)) {
            filterTags.value = currentValue;
        }
    }
}

// ===== END PRODUCTIVITY FEATURES =====

// Legacy Functions (keep for compatibility)
async function loadAllData() {
    await Promise.all([
        loadTasks(),
        loadNotes(),
        loadDocuments(),
        loadLogs(),
        loadSubAgents()
    ]);
}

async function loadDocuments() {
    try {
        const response = await fetch(`${API_BASE}/api/documents`);
        const docs = await response.json();
        
        const container = document.getElementById('documentsList');
        if (container) {
            container.innerHTML = '';
            docs.forEach(doc => {
                const item = document.createElement('div');
                item.className = 'document-item';
                item.onclick = () => openDocumentEditor(doc.id);
                item.innerHTML = `
                    <i class="fas fa-file-alt"></i>
                    <div class="document-info">
                        <h4>${escapeHtml(doc.title)}</h4>
                        <p>${formatDate(doc.updated_at)}</p>
                    </div>
                `;
                container.appendChild(item);
            });
        }
    } catch (e) {
        console.error('Failed to load documents:', e);
    }
}

async function loadLogs() {
    try {
        const response = await fetch(`${API_BASE}/api/logs?limit=20`);
        const logs = await response.json();
        
        const container = document.getElementById('logsList');
        if (container) {
            container.innerHTML = '';
            logs.reverse().forEach(log => {
                const entry = document.createElement('div');
                entry.className = 'log-entry';
                
                let icon = 'fa-info-circle';
                let color = 'var(--neon-cyan)';
                if (log.type === 'task_created') { icon = 'fa-plus-circle'; color = 'var(--neon-green)'; }
                if (log.type === 'task_updated') { icon = 'fa-edit'; color = 'var(--neon-cyan)'; }
                if (log.type === 'status_change') { icon = 'fa-sync'; color = 'var(--neon-purple)'; }
                if (log.type === 'subagent') { icon = 'fa-robot'; color = 'var(--neon-pink)'; }
                
                entry.innerHTML = `
                    <span class="log-time">${formatTime(log.created_at)}</span>
                    <i class="fas ${icon}" style="color: ${color}; margin-right: 8px;"></i>
                    <span class="log-message">${escapeHtml(log.message)}</span>
                `;
                container.appendChild(entry);
            });
            container.scrollTop = container.scrollHeight;
        }
    } catch (e) {
        console.error('Failed to load logs:', e);
    }
}

function updateStats(tasks) {
    const totalTasks = document.getElementById('totalTasks');
    const inProgress = document.getElementById('inProgress');
    const completed = document.getElementById('completed');
    
    if (totalTasks) totalTasks.textContent = tasks.length;
    if (inProgress) inProgress.textContent = tasks.filter(t => t.status === 'in-progress').length;
    if (completed) completed.textContent = tasks.filter(t => t.status === 'completed').length;
}

// Utilities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Modal Functions
function openTaskModal(task = null) {
    const modal = document.getElementById('taskModal');
    const form = document.getElementById('taskForm');
    const title = document.getElementById('taskModalTitle');
    
    form.reset();
    
    if (task) {
        title.textContent = 'EDIT PROJECT';
        document.getElementById('taskId').value = task.id;
        document.getElementById('taskTitle').value = task.title;
        document.getElementById('taskDescription').value = task.description || '';
        document.getElementById('taskStatus').value = task.status;
        document.getElementById('taskPriority').value = task.priority;
        document.getElementById('taskTags').value = task.tags || '';
    } else {
        title.textContent = 'CREATE NEW PROJECT';
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
        created_by: currentUser
    };
    
    if (!taskData.title.trim()) {
        alert('Please enter a task title');
        return;
    }
    
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

async function deleteTask(taskId, taskTitle) {
    if (!confirm(`Are you sure you want to delete "${taskTitle}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/tasks/${taskId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            addLog('task_deleted', `Task "${taskTitle}" deleted`);
            loadTasks();
        } else {
            alert('Failed to delete task');
        }
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Failed to delete task');
    }
}

function closeDocumentEditor() {
    document.getElementById('documentEditorModal').classList.remove('active');
}

function closeThreadModal() {
    document.getElementById('threadModal').classList.remove('active');
    currentTaskId = null;
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
});

async function addLog(type, message) {
    try {
        await fetch(`${API_BASE}/api/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, message })
        });
        loadLogs();
    } catch (e) {
        console.error('Failed to add log:', e);
    }
}

function showSection(section) {
    // Navigation handler - currently just tasks is implemented
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

// ===== PHASE 1: FUTURISTIC EFFECTS =====

// Matrix Rain Background
function initMatrixRain() {
    const canvas = document.getElementById('matrixCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const fontSize = 14;
    const columns = canvas.width / fontSize;
    const drops = [];
    
    for (let i = 0; i < columns; i++) {
        drops[i] = Math.random() * -100;
    }
    
    function draw() {
        ctx.fillStyle = 'rgba(10, 10, 15, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#00f5ff';
        ctx.font = fontSize + 'px monospace';
        
        for (let i = 0; i < drops.length; i++) {
            const char = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(char, i * fontSize, drops[i] * fontSize);
            
            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }
    
    setInterval(draw, 50);
    
    window.addEventListener('resize', () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    });
}

// Random Glitch Effects
function initGlitchEffects() {
    const glitchElements = document.querySelectorAll('.glitch-text');
    
    function triggerGlitch() {
        const element = glitchElements[Math.floor(Math.random() * glitchElements.length)];
        if (element) {
            element.style.animation = 'none';
            element.offsetHeight; // Trigger reflow
            element.style.animation = '';
            
            // Random text scramble
            const originalText = element.getAttribute('data-text') || element.textContent;
            const chars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
            let iterations = 0;
            
            const interval = setInterval(() => {
                element.textContent = originalText
                    .split('')
                    .map((char, index) => {
                        if (index < iterations) return originalText[index];
                        return chars[Math.floor(Math.random() * chars.length)];
                    })
                    .join('');
                
                iterations += 1/3;
                if (iterations >= originalText.length) {
                    clearInterval(interval);
                    element.textContent = originalText;
                }
            }, 30);
        }
        
        // Schedule next glitch (random interval between 3-10 seconds)
        setTimeout(triggerGlitch, Math.random() * 7000 + 3000);
    }
    
    // Start glitch loop
    setTimeout(triggerGlitch, 3000);
}

// 3D Card Tilt Effect - DISABLED to prevent drag/drop issues
function initCardTilt() {
    // Disabled - was interfering with drag and drop
    // The hover effect in CSS is sufficient
}

// Initialize
document.addEventListener('DOMContentLoaded', init);