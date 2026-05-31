# 💳 CardRemind – Credit Card Payment Reminder

A PWA (Progressive Web App) that runs in the browser and can be installed on iPhone like a native app.

## Features
- Add multiple credit cards with due dates
- Color-coded urgency (urgent / soon / upcoming)
- Mark cards as paid each cycle
- Summary strip showing total due
- Browser notifications for upcoming payments
- Works offline
- Installable on iPhone via Safari

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `cardremind`)
2. Upload all files into the repo root:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icons/icon-192.png`
   - `icons/icon-512.png`
3. Go to **Settings → Pages**
4. Set Source to **Deploy from a branch → main → / (root)**
5. Click **Save** — your app will be live at:
   `https://yourusername.github.io/cardremind`

## Install on iPhone

1. Open the URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share** icon (box with arrow)
3. Tap **"Add to Home Screen"**
4. Tap **Add**
5. Done! It appears on your home screen like a real app 📱

## App Icons

You need two icon files in the `icons/` folder:
- `icons/icon-192.png` — 192×192 pixels
- `icons/icon-512.png` — 512×512 pixels

You can create a simple credit card icon using Canva, Figma, or any image editor.
Use a dark background (#0a0a0f) with a 💳 emoji or custom design.

## Notes
- All data is stored locally on the device (localStorage)
- No server or backend needed
- Notifications require Safari permission on iOS 16.4+
