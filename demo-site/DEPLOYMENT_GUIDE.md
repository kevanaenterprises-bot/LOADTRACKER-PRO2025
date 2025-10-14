# 🚂 Railway Deployment Guide - Turtle Logistics Demo Site

## Quick Start (5 Minutes)

### 1️⃣ Create New Railway Project

1. Go to [railway.app](https://railway.app)
2. Click **"New Project"**
3. Select **"Empty Project"**
4. Name it: `loadtracker-demo-site`

### 2️⃣ Deploy From GitHub (Recommended)

**Option A: Using Git**
```bash
cd demo-site
git init
git add .
git commit -m "Initial demo site"
git remote add demo <your-railway-git-url>
git push demo main
```

**Option B: Using Railway CLI**
```bash
npm install -g @railway/cli
railway login
cd demo-site
railway link
railway up
```

### 3️⃣ Set Environment Variable

In Railway dashboard:
1. Click on your demo site project
2. Go to **"Variables"** tab
3. Add variable:
   - **Key**: `MAIN_APP_URL`
   - **Value**: `https://your-production-app.up.railway.app`

### 4️⃣ Connect turtlelogistics.com Domain

1. In Railway, click **"Settings"** → **"Domains"**
2. Click **"Custom Domain"**
3. Enter: `www.turtlelogisticsllc.com`
4. Railway shows DNS records (copy these!)

### 5️⃣ Update GoDaddy DNS

1. Login to GoDaddy
2. Find `turtlelogisticsllc.com` domain
3. Click **"DNS"** or **"Manage DNS"**
4. Add these records (from Railway):

**For www subdomain:**
- **Type**: CNAME
- **Host**: www
- **Points to**: `<railway-provided-domain>.up.railway.app`
- **TTL**: 1 hour

**For root domain (@):**
- **Option 1** (Recommended): Set up domain forwarding in GoDaddy to redirect `turtlelogisticsllc.com` → `www.turtlelogisticsllc.com`
- **Option 2**: If GoDaddy supports ALIAS/ANAME records, point `@` to `<railway-domain>.up.railway.app`
- **Note**: Railway requires CNAME/ALIAS records, not A records with IPs

⏰ **Wait 10-60 minutes for DNS to propagate**

### 6️⃣ Test Your Site

1. Visit: `https://www.turtlelogisticsllc.com`
2. Should see the Turtle mascot and pricing page!
3. Submit demo form to test the flow

## 🔍 Troubleshooting

### Site not loading after DNS changes?
- DNS can take up to 48 hours (usually 10-60 min)
- Check DNS propagation: [whatsmydns.net](https://www.whatsmydns.net)
- Make sure CNAME points to Railway's domain (ends in `.up.railway.app`)

### Demo form not working?
- Check `MAIN_APP_URL` environment variable in Railway
- Make sure it points to your production app URL
- Verify main app has `/api/demo/start` endpoint

### SSL/HTTPS issues?
- Railway handles SSL automatically
- Wait for DNS to fully propagate first
- SSL cert generation happens after domain verification

## 📊 Expected Costs

**Railway Pricing:**
- **Hobby Plan**: $5/month (includes $5 credit) - Perfect for this demo site
- **Demo site usage**: ~$1-2/month (very light traffic)
- **Production app**: Separate billing

**Domain (GoDaddy):**
- **Already paid**: ~$12/year for turtlelogistics.com

**Total**: ~$5/month Railway + domain you already own

## 🎯 Final Setup Checklist

- [ ] Railway project created
- [ ] Code deployed to Railway
- [ ] `MAIN_APP_URL` environment variable set
- [ ] Custom domain added in Railway
- [ ] DNS records updated in GoDaddy
- [ ] DNS propagated (test with dig or nslookup)
- [ ] Site loads at www.turtlelogistics.com
- [ ] Demo form submits successfully
- [ ] SSL/HTTPS working (green padlock)

## 🔗 Useful Links

- [Railway Docs](https://docs.railway.app)
- [Railway Custom Domains Guide](https://docs.railway.app/deploy/exposing-your-app#custom-domains)
- [GoDaddy DNS Help](https://www.godaddy.com/help/manage-dns-records-680)

---

**Need help?** Check Railway logs in the dashboard under "Deployments" → "View Logs"
