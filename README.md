<img width="120" alt="image" src="https://github.com/user-attachments/assets/822f14b5-181b-462f-b9ee-59c1f28534a9" />

# Hilltoppers

A toolkit for people in Saint Johnsbury Academy


### iOS: 

<img width="800" alt="image" src="https://github.com/user-attachments/assets/65a9984a-1077-4531-9f75-eccbf5774e27" /> 

### Chrome Extension: 

<img width="400" alt="image" src="https://github.com/user-attachments/assets/876722b8-1dae-4c1c-8d1c-870834710afa" />



# ✨ Features
### Schedule
  Get an up-to-date schedule, even if it is not a regular one (like ABDEC and Spirit Week)
  Customize your own schedule by putting in the names of your Courses

### Check the day color
  Know whether it is a Green/White Day in seconds

### Timer
  See the timer for the end of the block without opening the app/extension



# ⬇️ Installation
## iOS: 
[App Store Link](https://apps.apple.com/us/app/hilltoppers/id6749836752)

## Chrome Extension:
[Chrome Web Store Link](https://chromewebstore.google.com/detail/bcjpcmlikbccobbpheojlnmiaffilnaa?utm_source=item-share-cb)

You can also install it manually.
It’s quick and safe — no special permissions required.

### 1️⃣ Download the dist.zip file

Get the ZIP file in the release (on the right of this page)

Unzip it — you’ll get a folder named dist.

### 2️⃣ Open Chrome Extensions Page

Open Chrome and go to
👉 chrome://extensions

In the top right corner, turn on Developer mode.

### 3️⃣ Load the Extension

Click “Load unpacked”.

Select the dist folder (not the ZIP file).

### 4️⃣ Done!

You’ll now see the extension icon appear in the Chrome toolbar.

Click the puzzle icon 🧩 → Pin it for quick access.

### 5️⃣ Optional: Update Later

If there is a new version, just:

Load the new dist folder again

---

# 🔧 Development Setup

For developers who want to build and run the project locally, see [SETUP.md](./SETUP.md) for detailed instructions.

## Repository layout

| Folder | What it is |
|---|---|
| `ios/` | The iOS app and its widget — one Xcode project, `ios/SJA_re.xcodeproj` |
| `chrome-extension/` | The Chrome extension |
| `data/` | Everything both apps download: special days, breaks, dining menu, iOS universal-link file. `data/public/` is served as-is from Cloudflare Pages; `data/scripts/` keeps it current |
| `worker/` | The ideas-board API (Cloudflare Worker). The only server-side code |
| `ideas-site/` | Website for the ideas board — paused, see its README |

**Important**: This project requires Firebase configuration. Make sure to:
- Add `ios/SJA_re/GoogleService-Info.plist` for iOS app
- Create `chrome-extension/.env.local` for Chrome extension

See [SETUP.md](./SETUP.md) for more details.
