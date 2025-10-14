# GitHub Setup - Simple Steps

## Option 1: GitHub Website (Easiest)

### Step 1: Create New Repo
1. Go to https://github.com/new
2. Repository name: `loadtracker-demo-site`
3. Click **"Create repository"**

### Step 2: Copy These Commands

After creating the repo, GitHub shows you commands. Use these instead:

```bash
cd demo-site
git init
git add .
git commit -m "Demo site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/loadtracker-demo-site.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your GitHub username.

---

## Option 2: Railway Direct (Skip GitHub)

You can deploy WITHOUT GitHub:

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Deploy:
   ```bash
   cd demo-site
   railway login
   railway init
   railway up
   ```

3. Add environment variable in Railway dashboard:
   - `MAIN_APP_URL` = your production app URL

4. Connect domain in Railway settings

Done!

---

## Need Help?

All the files are ready in the `demo-site` folder. Just need to get them deployed to Railway - either through GitHub or directly.

Take your time tomorrow!
