# 🐢 Turtle Logistics - LoadTracker Pro Demo Site

This is the standalone demo/marketing website for LoadTracker Pro by Turtle Logistics.

## 🚀 Deploy to Railway

### Step 1: Prepare the Deployment

1. **Create a new Railway project** for the demo site (separate from your main app)
2. **Connect this `demo-site` folder** as the root directory

### Step 2: Set Environment Variables

In your Railway project settings, add:

```
MAIN_APP_URL=https://your-main-app.up.railway.app
PORT=3000
```

Replace `your-main-app.up.railway.app` with your actual production app URL on Railway.

### Step 3: Deploy

Railway will automatically:
- Detect this as a Node.js app
- Run `npm install`
- Start the server with `node server.js`

### Step 4: Connect Your Domain (turtlelogistics.com)

1. In Railway dashboard, go to your demo site deployment
2. Click **Settings** → **Domains**
3. Click **Custom Domain**
4. Enter `www.turtlelogisticsllc.com` (or your preferred subdomain)
5. Railway will provide DNS records

### Step 5: Configure DNS (In GoDaddy)

1. Log into GoDaddy
2. Go to your `turtlelogisticsllc.com` domain
3. Click **DNS Management**
4. Add CNAME record for www subdomain:
   - **Type**: CNAME
   - **Host**: `www`
   - **Points to**: Railway's provided domain (e.g., `yourapp-xxxxx.up.railway.app`)
   - **TTL**: 1 hour
5. (Optional) Set up forwarding for root domain:
   - In GoDaddy settings, forward `turtlelogisticsllc.com` → `www.turtlelogisticsllc.com`
   - This ensures both URLs work

**Note**: Railway uses CNAME records, not A records. DNS propagation takes 10-60 minutes.

## 📁 File Structure

```
demo-site/
├── server.js          # Express server
├── package.json       # Dependencies
├── railway.json       # Railway config
├── public/
│   ├── index.html     # Landing page
│   └── turtle-mascot.png  # Logo
└── README.md          # This file
```

## 🔧 Local Development

```bash
cd demo-site
npm install
npm start
```

Visit http://localhost:3000

## 📝 How It Works

1. **Landing page** shows features and pricing (100% transparent!)
2. **Demo form** submits to your main app's `/api/demo/start` endpoint
3. **Redirect** sends users to the main app with a demo session token
4. **Branding** showcases Turtle Logistics as the LoadTracker Pro vendor

## 🌐 Production URLs

- **Demo Site**: https://www.turtlelogisticsllc.com (or your custom domain)
- **Main App**: https://your-main-app.up.railway.app

## 💡 Tips

- Keep demo site lightweight (it's just HTML/CSS/JS)
- Main app handles all the heavy lifting
- Demo site is just the marketing front door
- SSL/HTTPS handled automatically by Railway
