# RitesDev App

A beautiful, soft-designed **native desktop application** for managing all your RitesDev development apps. Built with **Electron** to run as a proper application on Fedora Plasma (and other Linux distributions).

## Features

✨ **Key Features:**
- 🎨 Soft, easy-to-read interface with pastel colors
- 🖥️ **Native desktop app** - Runs as an Electron application, not in a browser
- 🔄 Auto-discovers apps from `devapps-registry.mjs`
- 🚀 One-click app launch
- ⏹️ Easy app shutdown
- 🔁 Quick app restart
- 👁️ Live status monitoring
- 📊 Running apps sidebar showing active applications
- 🎯 Responsive design

## Installation on Fedora Plasma

### Quick Install (Recommended)

```bash
cd devApps/ritesDevApp
bash install-linux.sh
```

This will:
- ✅ Install the desktop application file
- ✅ Register the app with your system
- ✅ Make it appear in your Applications menu
- ✅ Allow you to launch it with a single click

### Verify Installation

After installation, search for "RitesDev App" in your Fedora Plasma application menu. It should appear with a system icon.

## Usage

### Launch from Applications Menu

1. Open your Fedora Plasma applications menu
2. Search for "RitesDev App"
3. Click to launch

### Launch from Terminal

```bash
cd devApps/ritesDevApp
npm start
```

Or use the quick launcher script:

```bash
bash launch.sh
```

### Mobile Mode

1. Open the launcher on the PC and turn on **Mobile Mode**.
2. Connect the phone to the same local network as the PC.
3. Open the address displayed in the Mobile Mode panel on the phone.
4. Select an app. The launcher opens its desktop window and opens the browser version in a new phone tab.

Mobile mode turns off whenever the launcher exits. App browser servers listen on loopback only and are available to the local network solely through the launcher while mobile mode is enabled. If the displayed address does not connect, allow TCP port `4605` through the PC firewall for the private network.

## Launcher Interface

The launcher window displays:

### App Cards
Each card shows:
- App name and type
- Description of what it does
- Port number
- What sites it manages
- Launch/Stop/Restart buttons
- Running status (● Running / ○ Stopped)

### Sidebar
- Count of running apps
- List of currently running applications
- Quick info about launcher

### Header
- Launcher name
- Status indicator (shows system is ready)
- Refresh button

## Controls

- **Launch Button** (Green) - Start a stopped app
- **Stop Button** (Red) - Stop a running app
- **Restart Button** (Gray) - Stop and restart an app
- **Refresh Button** - Manually refresh the app list

## Application Architecture

### Electron Main Process (`electron-main.js`)
- Manages the native window
- Starts the Express server as a child process
- Handles app lifecycle
- Manages graceful shutdown

### Express Server (`server.mjs`)
- Provides REST API for app discovery
- Manages launching/stopping other applications
- Reads app registry
- Handles process lifecycle

### Frontend UI (`public/`)
- `index.html` - Clean semantic structure
- `style.css` - Soft pastel design with animations
- `app.js` - Communicates with server API
- Auto-refresh every second
- Real-time app status updates

## Auto-Discovery

The launcher automatically discovers apps by:
1. Reading the `devapps-registry.mjs` configuration
2. Finding app folders in `devApps/`
3. Reading `devapp.meta.json` for metadata
4. Detecting which apps are currently running

## REST API Endpoints

While the app is primarily a desktop GUI, you can also access the API programmatically:

```
GET    /api/apps              - List all discovered apps
GET    /api/status            - Health check
POST   /api/apps/:id/start    - Start an app
POST   /api/apps/:id/stop     - Stop an app
POST   /api/apps/:id/restart  - Restart an app
```

### Example API Usage

```bash
# List all apps
curl http://localhost:4605/api/apps

# Start an app
curl -X POST http://localhost:4605/api/apps/blog-post-manager/start

# Stop an app
curl -X POST http://localhost:4605/api/apps/blog-post-manager/stop
```

## Design Philosophy

The launcher is designed with a **soft, easy-to-navigate aesthetic**:

- **Colors**: Soft pastels (blues, purples, greens, warm tones)
- **Spacing**: Generous whitespace for clarity
- **Typography**: Large, readable fonts with good hierarchy
- **Animations**: Smooth, subtle transitions
- **Cards**: Clean app cards with clear information hierarchy
- **Feedback**: Notifications for actions (launch, stop, restart)

## File Structure

```
ritesDevApp/
├── electron-main.js              # Electron main process
├── preload.js                    # Security preload script
├── server.js                     # Express server with app discovery
├── launch.sh                     # Quick launch script
├── install-linux.sh              # Desktop installation script
├── ritesDevApp.desktop      # Desktop file (for app menus)
├── package.json                  # Dependencies
├── devapp.meta.json              # Launcher metadata
├── public/
│   ├── index.html                # HTML structure
│   ├── style.css                 # Soft pastel styling
│   └── app.js                    # Frontend logic
└── README.md                     # This file
```

## Configuration

Apps are configured in `devapps-registry.mjs`:

```javascript
"app-id": {
  name: "Display Name",
  type: "launcher",
  description: "What this app does",
  port: 4605,
  basePath: "app-folder",
  active: true,
  manages: ["s-blog", "s-ritesdev"]
}
```

## Dependencies

- **express** - Web framework for API server
- **electron** - Native desktop application framework
- **node:child_process** - Process management
- **node:fs** - File system access
- **node:path** - Path utilities

## Scripts

```bash
npm start        # Run the Electron app (desktop window)
npm run dev      # Run with developer tools enabled
npm run server   # Run just the Express server (for testing)
```

## Troubleshooting

### App not appearing in menu after installation

```bash
# Manually update desktop database
update-desktop-database ~/.local/share/applications
```

### Can't launch apps from launcher

1. Check that app folders exist in `devApps/`
2. Verify each app has `devapp.meta.json`
3. Check that app is registered with `active: true` in devapps-registry.mjs
4. Click the refresh button in the launcher

### Launcher window won't open

```bash
# Run from terminal to see error messages
cd devApps/ritesDevApp
npm start
```

### Port 4605 already in use

Change the port in `server.js` and update `devapps-registry.mjs`

## Uninstallation

To remove the launcher from your system:

```bash
rm ~/.local/share/applications/ritesDevApp.desktop
update-desktop-database ~/.local/share/applications
```

## Port

**Port 4605** - Managed by the RitesDev App (Express server runs internally)

## Extending with New Apps

All new apps you add to `devApps/` will automatically appear in the launcher. To add a new app:

1. Create folder: `devApps/your-app-name/`
2. Add `devapp.meta.json` with app metadata
3. Register in `devapps-registry.mjs` with `active: true`
4. The launcher will auto-discover it on next refresh

RitesDev Ecosystem

## License

Part of RitesDev Ecosystem
