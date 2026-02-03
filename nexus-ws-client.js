#!/usr/bin/env node
/**
 * Nexus WebSocket Client
 * Connect to Nexus and listen for real-time events
 * Usage: node nexus-ws-client.js [wss://nexus.noospherefactotum.com]
 */

const WebSocket = require('ws');

const NEXUS_WS_URL = process.argv[2] || 'wss://nexus.noospherefactotum.com';

console.log(`🔌 Connecting to Nexus WebSocket at ${NEXUS_WS_URL}...`);
console.log('📡 Listening for: task_created, task_updated, note_added, comment_added\n');

const ws = new WebSocket(NEXUS_WS_URL, {
  headers: {
    'x-agent-type': 'main'
  }
});

ws.on('open', () => {
  console.log('✅ Connected to Nexus!\n');
  console.log('═══════════════════════════════════════════');
  console.log('  🟢 MONITORING - Waiting for events...');
  console.log('═══════════════════════════════════════════\n');
});

ws.on('message', (data) => {
  try {
    const event = JSON.parse(data);
    const timestamp = new Date().toLocaleTimeString();
    
    switch (event.type) {
      case 'connected':
        console.log(`[${timestamp}] 🤖 Connected as main agent`);
        console.log(`         Status: ${event.data.status.status}`);
        console.log(`         Current Task: ${event.data.status.current_task || 'None'}\n`);
        break;
        
      case 'status':
        console.log(`[${timestamp}] 📊 Status Update: ${event.data.status}`);
        if (event.data.current_task) {
          console.log(`         Task: ${event.data.current_task}`);
        }
        console.log('');
        break;
        
      case 'task_created':
        console.log(`[${timestamp}] 🆕 NEW TASK`);
        console.log(`         Title: ${event.data.title}`);
        console.log(`         Priority: ${event.data.priority}`);
        console.log(`         Status: ${event.data.status}`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'task_updated':
        console.log(`[${timestamp}] 🔄 TASK UPDATED`);
        console.log(`         Title: ${event.data.title}`);
        console.log(`         Status: ${event.data.status}`);
        console.log(`         Priority: ${event.data.priority}`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'task_deleted':
        console.log(`[${timestamp}] 🗑️ TASK DELETED`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'note_added':
        const notePreview = event.data.content.length > 100 
          ? event.data.content.substring(0, 100) + '...' 
          : event.data.content;
        console.log(`[${timestamp}] 📝 NEW NOTE`);
        console.log(`         Author: ${event.data.author || 'Gene'}`);
        console.log(`         Content: ${notePreview}`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'comment_added':
        const commentPreview = event.data.content.length > 100 
          ? event.data.content.substring(0, 100) + '...' 
          : event.data.content;
        console.log(`[${timestamp}] 💬 NEW COMMENT`);
        console.log(`         Author: ${event.data.author || 'Gene'}`);
        console.log(`         Task ID: ${event.data.task_id}`);
        console.log(`         Content: ${commentPreview}`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'log_added':
        console.log(`[${timestamp}] 📜 LOG: ${event.data.type}`);
        console.log(`         ${event.data.message}\n`);
        break;
        
      case 'document_created':
        console.log(`[${timestamp}] 📄 NEW DOCUMENT`);
        console.log(`         Title: ${event.data.title}`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'document_updated':
        console.log(`[${timestamp}] 📝 DOCUMENT UPDATED`);
        console.log(`         Title: ${event.data.title}`);
        console.log(`         ID: ${event.data.id}\n`);
        break;
        
      case 'subagent_update':
        console.log(`[${timestamp}] 🤖 SUB-AGENT UPDATE`);
        console.log(`         Name: ${event.data.name}`);
        console.log(`         Status: ${event.data.status}`);
        if (event.data.task) {
          console.log(`         Task: ${event.data.task}`);
        }
        console.log('');
        break;
        
      case 'subagent_complete':
        console.log(`[${timestamp}] ✅ SUB-AGENT COMPLETED`);
        console.log(`         Name: ${event.data.name}\n`);
        break;
        
      case 'subagent_timeout':
        console.log(`[${timestamp}] ⏱️ ${event.count} sub-agent(s) timed out\n`);
        break;
        
      default:
        console.log(`[${timestamp}] 📨 ${event.type}:`, JSON.stringify(event.data, null, 2), '\n');
    }
  } catch (err) {
    console.log(`[${new Date().toLocaleTimeString()}] Raw message:`, data.toString());
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});

ws.on('close', (code) => {
  console.log(`\n🔌 Connection closed (code: ${code})`);
  console.log('👋 Goodbye!');
  process.exit(0);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Disconnecting...');
  ws.close();
});
