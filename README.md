# 💳 CardRemind – Credit Card Payment Reminder

A PWA (Progressive Web App) that installs on Android and iPhone like a native app and reminds you before each credit card payment is due.

## Features
- Add multiple credit cards with due dates (synced via Supabase, sign in with name + PIN)
- Color-coded urgency (due soon / this week / upcoming)
- Mark cards as paid each month
- Summary strip showing total minimum due
- Payment reminder notifications, N days before the due date (1, 2, 3, 5 or 7)
- 📅 Add to calendar: a monthly calendar event with alarms, which always fires even when the app is closed
- Works offline, installable on Android and iPhone

## Deploy to GitHub Pages

1. Go to **Settings → Pages** in this repo
2. Set Source to **Deploy from a branch → main → / (root)** and **Save**
3. The app is live at `https://<username>.github.io/<repo>/` (e.g. `https://woeichyuangit.github.io/ccardreminder/`)

All paths are relative, so it works under any repo name.

## Install on Android
1. Open the URL in **Chrome**
2. Tap **Install app** in the app (or ⋮ menu → **Install app / Add to Home screen**)
3. Open CardRemind and tap **Enable notifications**

## Install on iPhone (iOS 16.4 or later)
1. Open the URL in **Safari**
2. Tap **Share** → **Add to Home Screen** → **Add**
3. Open CardRemind **from the Home Screen icon** and tap **Enable notifications**

iOS only allows web notifications for apps added to the Home Screen.

## How reminders work (and their limits)
There is no reminder server, so notifications are generated on the phone:
- Every time you open the app, it checks what is due within your reminder window and notifies you (at most once a day).
- On Android with the app installed, Chrome may also wake it in the background about once a day (Periodic Background Sync), depending on how often you use the app.
- iPhone does not let web apps wake themselves in the background, so notifications appear only when you open the app.

For a reminder that **always** fires on time, use **📅 Add to calendar** on each card. It adds a monthly event on the due date with an alarm at 9am N days before and on the day.

Fully automatic push notifications while the app is closed would need a small server job (e.g. a scheduled Supabase Edge Function sending Web Push).
