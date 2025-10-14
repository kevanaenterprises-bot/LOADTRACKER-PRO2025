# ⚡ QUICK START - 5 Minute Deploy

## You Already Own: turtlelogisticsllc.com ✅

Let's get your demo site live!

---

## 🚀 Deploy in 3 Steps

### Step 1: Push to Railway (2 min)

```bash
# From your main project directory
cd demo-site

# Install Railway CLI (one-time)
npm install -g @railway/cli

# Login to Railway
railway login

# Create new project
railway init

# Deploy!
railway up
```

Railway will give you a URL like: `loadtracker-demo-xxxxx.up.railway.app`

---

### Step 2: Set Environment Variable (1 min)

In Railway dashboard:
1. Click **"Variables"** tab
2. Add: `MAIN_APP_URL` = `https://your-production-app.up.railway.app`
3. Click **"Deploy"**

---

### Step 3: Connect Your Domain (2 min)

**In Railway:**
1. Click **"Settings"** → **"Domains"**
2. Add custom domain: `www.turtlelogisticsllc.com`
3. Railway shows DNS records → **COPY THESE!**

**In GoDaddy:**
1. Go to turtlelogisticsllc.com DNS settings
2. Add CNAME record:
   - Type: CNAME
   - Host: `www`
   - Points to: `<from-railway>.up.railway.app`
   - TTL: 1 hour
3. Set up forwarding (optional):
   - Forward `turtlelogisticsllc.com` → `www.turtlelogisticsllc.com`
4. Save

---

## ✅ You're Done!

Wait 10-30 minutes for DNS, then visit:
- ✨ **https://www.turtlelogisticsllc.com**

Your demo site will show:
- 🐢 Turtle mascot
- 💰 Transparent pricing
- 📝 Demo signup form

---

## 💡 Alternative: Manual Upload

Don't want to use CLI? 

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"** → **"Empty Project"**
3. Click **"Deploy from GitHub repo"**
4. Upload the `demo-site` folder
5. Follow steps 2 & 3 above

---

## 🆘 Need Help?

See `DEPLOYMENT_GUIDE.md` for detailed instructions!
