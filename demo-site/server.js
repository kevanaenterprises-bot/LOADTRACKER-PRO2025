const express = require('express');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

// Validate required environment variables
const MAIN_APP_URL = process.env.MAIN_APP_URL;
if (!MAIN_APP_URL) {
  console.error('❌ ERROR: MAIN_APP_URL environment variable is required!');
  console.error('Set it to your production app URL (e.g., https://your-app.up.railway.app)');
  process.exit(1);
}

console.log(`✅ Main app URL configured: ${MAIN_APP_URL}`);

// Serve static files
app.use(express.static('public'));

// Handle form submission (forward to main app)
app.use(express.json());
app.post('/api/demo/start', async (req, res) => {
  try {
    console.log('📝 Demo form submission received');
    
    // Forward to main Railway app
    const response = await fetch(`${MAIN_APP_URL}/api/demo/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
      console.error(`❌ Main app returned error: ${response.status}`);
      return res.status(response.status).json({ 
        error: 'Failed to create demo session. Please try again.' 
      });
    }
    
    const data = await response.json();
    console.log('✅ Demo session created');
    
    if (data.sessionToken) {
      // Store token and redirect to main app
      res.json({ 
        success: true, 
        sessionToken: data.sessionToken,
        redirectUrl: `${MAIN_APP_URL}/demo/dashboard` 
      });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error('❌ Error forwarding demo request:', error);
    res.status(500).json({ 
      error: 'Unable to connect to main application. Please try again later.' 
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🐢 Turtle Logistics Demo Site running on port ${PORT}`);
});
