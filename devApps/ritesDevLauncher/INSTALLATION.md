# RitesDev Launcher - Installation & Setup Guide

## Quick Start for Fedora Plasma

### Step 1: Automatic Installation (Recommended)

```bash
cd devApps/ritesDevLauncher
bash install-linux.sh
```

This will:
- ✅ Create desktop application file in `~/.local/share/applications/`
- ✅ Update desktop database
- ✅ Make the app appear in your Fedora Plasma applications menu

### Step 2: Launch the App

After installation, you have three options:

**Option A: From Applications Menu (Easiest)**
- Open Fedora Plasma applications menu
- Search for "RitesDev Launcher"
- Click to launch

**Option B: From Terminal**
```bash
cd devApps/ritesDevLauncher
npm start
```

**Option C: Using Launch Script**
```bash
bash launch.sh
```

## What Gets Installed

When you run `bash install-linux.sh`, it creates:

```
~/.local/share/applications/ritesDevLauncher.desktop
```

This file tells Fedora Plasma:
- The app is called "RitesDev Launcher"
- It should open with the command: `npm start` in the app directory
- It's a development utility app
- It should appear in your applications menu

## File Structure

```
ritesDevLauncher/
├── 📄 electron-main.js           # Electron main process (creates native window)
├── 📄 server.js                  # Express server (provides API & app discovery)
├── 📄 preload.js                 # Security preload script
├── 📄 package.json               # Dependencies (express, electron)
├── 📄 README.md                  # Full documentation
├── 📄 devapp.meta.json           # App metadata
├── 🔧 launch.sh                  # Quick launch script
├── 🔧 install-linux.sh           # Installation script
├── 📋 ritesDevLauncher.desktop   # Desktop application file
├── 📁 public/
│   ├── index.html                # User interface
│   ├── style.css                 # Soft pastel design
│   └── app.js                    # Frontend logic
└── 📁 node_modules/
    ├── express/                  # Web framework
    └── electron/                 # Desktop app framework
```

## How It Works

### Architecture

1. **Electron Main Process** (`electron-main.js`)
   - Creates a native desktop window
   - Starts the Express server as a child process
   - Manages the app lifecycle

2. **Express Server** (`server.js`)
   - Runs on localhost:4605
   - Reads the app registry from `devapps-registry.mjs`
   - Auto-discovers apps in the `devApps/` folder
   - Provides REST API for controlling apps

3. **Frontend UI** (`public/`)
   - Beautiful soft-pastel interface
   - Auto-refreshes every 3 seconds
   - Shows running status of all apps
   - Provides launch/stop/restart buttons

### App Discovery Flow

```
Launcher starts
  ↓
Electron main process (electron-main.js)
  ↓
Spawns Express server (server.js)
  ↓
Server reads devapps-registry.mjs
  ↓
Discovers apps in devApps/ folders
  ↓
Loads app metadata from devapp.meta.json
  ↓
Frontend connects to server API
  ↓
Displays all available apps with status
```

## Dependencies

- **express** ^4.18.2 - Web framework for REST API
- **electron** ^33.0.0 - Desktop application framework

Both are installed automatically when you run `npm install`.

## Key Features

✨ **As a Native Desktop App:**
- Appears in Fedora Plasma applications menu
- Runs as a standalone application with its own window
- No browser tabs or browser chrome
- Can be launched from anywhere
- Integrates with system desktop notifications

🎨 **User Interface:**
- Soft pastel colors (blues, purples, greens, warm tones)
- Auto-discovering app cards
- Real-time status updates
- Launch/Stop/Restart controls
- Running apps sidebar
- Smooth animations

🔄 **App Management:**
- Auto-discovers all apps in `devApps/` folder
- Shows app status (running/stopped)
- One-click launch, stop, restart
- Shows which sites each app manages
- Shows port numbers and app types

## Ports

- **Port 4605** - RitesDev Launcher Express Server (runs internally)
  - **API Base**: http://localhost:4605
  - **WebSocket**: Available for real-time updates
  - **Development**: Accessible via http://localhost:4605

Other apps will run on their configured ports as seen in `devapps-registry.mjs`:
- Port 4600 - dev-master launcher
- Port 4602 - content-editor
- Port 4603 - blog-post-manager
- Port 4605 - ritesDevLauncher

## Configuration

Apps are configured in `../../ritesGlobal/devapps-registry.mjs`:

```javascript
{
  "ritesDevLauncher": {
    name: "RitesDev Launcher",
    type: APP_TYPES.LAUNCHER,
    description: "Beautiful app launcher for managing all RitesDev development apps",
    port: 4605,
    basePath: "ritesDevLauncher",
    active: true,
    manages: ["all"],
    command: "npm start"
  }
}
```

To add new apps, update the registry and they'll automatically appear in the launcher.

## Troubleshooting

### App won't start

**Check 1: Dependencies installed**
```bash
ls node_modules | grep electron
```

**Check 2: Run from terminal for errors**
```bash
cd devApps/ritesDevLauncher
npm start
```

**Check 3: Port 4605 in use**
Check what's using port 4605:
```bash
lsof -i :4605
```

### App not appearing in menu

After installation, update the desktop database:
```bash
update-desktop-database ~/.local/share/applications
```

Then refresh your application menu.

### Can't launch other apps from launcher

1. Verify app folder exists in `devApps/`
2. Check `devapp.meta.json` exists
3. Verify app is `active: true` in registry
4. Click refresh button in launcher

### Desktop file not found

Check it was created:
```bash
cat ~/.local/share/applications/ritesDevLauncher.desktop
```

If missing, reinstall:
```bash
bash install-linux.sh
```

## Uninstall

Remove the desktop entry:

```bash
rm ~/.local/share/applications/ritesDevLauncher.desktop
update-desktop-database ~/.local/share/applications
```

The app folder remains in `devApps/ritesDevLauncher/` if you want to keep it.

## Development

### Run with Developer Tools

```bash
npm run dev
```

This opens the DevTools console for debugging.

### Run Just the Server (without Electron)

```bash
npm run server
```

This starts just the Express server on port 4605. Access via http://localhost:4605 in a browser.

### Build for Distribution

To create a distributable Electron package:

```bash
npm run build
```

(Requires electron-builder configuration in package.json)

## Next Steps

Once the launcher is working:

1. **Add Management Apps** - Convert content-editor and blog-post-manager to Electron apps
2. **Create Desktop Files** - Each app gets its own desktop file for the menu
3. **Test Auto-Discovery** - Verify all apps show in launcher
4. **Test Launch/Stop** - Verify apps can be controlled from launcher

## More Information

- **Full Documentation**: [README.md](./README.md)
- **App Registry**: [devapps-registry.mjs](../../ritesGlobal/devapps-registry.mjs)
- **Management Setup**: [ritesGlobal README](../../ritesGlobal/README.md)

## Quick Commands Reference

```bash
# Installation
bash install-linux.sh

# Running
npm start                # Electron app
npm run dev             # With DevTools
npm run server          # Express server only
bash launch.sh          # Quick launch

# Management
npm install             # Install dependencies
npm uninstall           # Remove dependencies

# System
lsof -i :4605           # Check port
ps aux | grep electron  # Check running process
```

## Support

For issues or questions about the RitesDev Launcher, check:
1. This guide's Troubleshooting section
2. The [README.md](./README.md) in this folder
3. The main project's GitHub issues

---

**Installed Successfully!** 🎉

Your RitesDev Launcher is ready to use. Search for it in Fedora Plasma's applications menu and launch it!
