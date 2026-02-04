// Nexus notification log for OpenClaw to read
// Format: [timestamp] [type] [author]: [content]
// This file is written by Nexus and read by OpenClaw (both on same server)

const fs = require('fs');
const path = require('path');

const NOTIFICATION_LOG = process.env.NOTIFICATION_LOG || '/data/nexus-notifications.log';

/**
 * Log notification to shared file for OpenClaw to read
 */
function logNotification(type, content, from = 'Gene') {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] [Nexus:${type}] ${from}: ${content}\n`;
  
  try {
    fs.appendFileSync(NOTIFICATION_LOG, line);
    console.log(`🔔 Notification logged: ${type}`);
  } catch (err) {
    console.error('❌ Failed to log notification:', err.message);
  }
}

module.exports = { logNotification };
