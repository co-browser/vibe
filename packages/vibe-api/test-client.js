const http = require('http');

// Helper function to make HTTP requests
function makeRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            resolve(body);
          }
        } else {
          reject(new Error(`Request failed with status ${res.statusCode}: ${body}`));
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test SSE chat streaming
function testChatStreaming(message) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ message });
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/agent/chat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const req = http.request(options, (res) => {
      console.log(`\n📡 Chat streaming test - Status: ${res.statusCode}`);
      
      if (res.statusCode !== 200) {
        let errorBody = '';
        res.on('data', chunk => errorBody += chunk);
        res.on('end', () => {
          reject(new Error(`Failed with status ${res.statusCode}: ${errorBody}`));
        });
        return;
      }
      
      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        lines.forEach(line => {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data) {
              try {
                const event = JSON.parse(data);
                console.log('📨 Event:', event);
                
                if (event.type === 'done') {
                  resolve();
                }
              } catch (e) {
                console.error('Failed to parse event:', data);
              }
            }
          }
        });
      });
      
      res.on('error', reject);
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Run tests
async function runTests() {
  console.log('🧪 Testing vibe-api endpoints...\n');
  
  try {
    // Test 1: Health check
    console.log('1️⃣ Testing health endpoint...');
    const health = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/health',
      method: 'GET'
    });
    console.log('✅ Health check:', health);
    
    // Test 2: Agent status (before initialization)
    console.log('\n2️⃣ Testing agent status (before init)...');
    const statusBefore = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/agent.status',
      method: 'GET'
    });
    console.log('✅ Agent status:', statusBefore);
    
    // Test 3: Initialize agent
    console.log('\n3️⃣ Initializing agent...');
    const initResult = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/agent.initialize',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      processorType: 'react'
    });
    console.log('✅ Agent initialized:', initResult);
    
    // Test 4: Agent status (after initialization)
    console.log('\n4️⃣ Testing agent status (after init)...');
    const statusAfter = await makeRequest({
      hostname: 'localhost',
      port: 3000,
      path: '/api/agent.status',
      method: 'GET'
    });
    console.log('✅ Agent status:', statusAfter);
    
    // Test 5: Chat streaming
    console.log('\n5️⃣ Testing chat streaming...');
    await testChatStreaming('What is 2+2?');
    console.log('✅ Chat streaming completed');
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Check if server is running
const checkServer = http.get('http://localhost:3000/api/health', (res) => {
  if (res.statusCode === 200) {
    runTests();
  }
});

checkServer.on('error', () => {
  console.error('❌ Server is not running. Please start it with: pnpm dev');
  process.exit(1);
});