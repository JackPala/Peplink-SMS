# Peplink SMS Node App

Backend server that powers the Peplink SMS UI. It serves the finished frontend found in `bootstrap-frontend/`, exposes a setup flow backed by SQLite, and prepares the project for future API integrations.

## Getting Started

```bash
cd app
npm install
npm run dev   # or npm start
```

Then open http://localhost:3000. On first launch you will be redirected to `/setup` to provide the credentials requested on the form. After saving the setup data you are redirected to the main inbox UI (`index.html`).

The username/password you supply on the setup screen become the credentials for HTTP Basic authentication protecting the rest of the app. After setup completes, every request (including static assets) requires these credentials. Use the Logout option in the UI (or visit `/logout`) to invalidate the browser session and show the login prompt again.

## Project Structure

- `server.js` – Express application that serves the frontend, handles setup submissions, and exposes helper APIs.
- `db.js` – SQLite bootstrapping plus helper methods (`getSettings`, `saveSettings`).
- `data/` – Location of the SQLite database file (`peplink_sms.db`). Ignored by Git.
- `../bootstrap-frontend/` – Source of the UI assets (HTML, CSS, JS, Bootstrap bundles, etc.). These files are served statically by Express.

## Available Scripts

- `npm start` – Runs the server in production mode.
- `npm run dev` – Same as start but watches for file changes using nodemon.

## API Surface

- `GET /health` – Simple health probe.
- `POST /setup` – Stores the setup form (expects the exact field names used in `setup.html`).
- `GET /api/settings` – Returns the stored setup metadata (excludes sensitive passwords).
- `GET /logout` – Responds with a `401` challenge so the browser clears the current Basic Auth credentials.

> The login password is stored as a bcrypt hash. Router credentials remain in plain text so the future router integration can re-use them directly.
