// Simple webhook sender
const https = require('https');
const http = require('http');

const WEBHOOK_URL = 'http://161.97.177.64:3000/hooks/nexus';

function sendWebhook(data) {
  const postData = JSON.stringify(data);
  
  const options = {
    hostname: '161.97.177.64',
    port: 3000,
    path: '/hooks/nexus',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    console.log(`Webhook sent: ${res.statusCode}`);
  });
  
  req.on('error', (e) => {
    console.error(`Webhook error: ${e.message}`);
  });
  
  req.write(postData);
  req.end();
}

module.exports = { sendWebhook };
