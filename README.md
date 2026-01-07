<div align="center">
  <img src="bootstrap-frontend/assets/logos/Peplink-SMS-Logo-FULL.png" alt="Peplink SMS Logo" width="600">
</div>

# Peplink-SMS

An Open Source Responsive WebUI for sending and receiving SMS thru Peplink

**IMPORTANT NOTE:** I built this software myself as I wanted to send and receive SMS over Peplink without needing the stock UI to do so. I am not associated with Peplink in any way, shape, or form, at the time of this writing.

## Bootstrap Frontend

<picture>
  <source srcset="https://github.com/user-attachments/assets/b9021107-7b2f-4ded-babd-8db485770b72" type="image/webp">
  <source srcset="https://github.com/user-attachments/assets/b9021107-7b2f-4ded-babd-8db485770b72" type="image/png">
  <img src="https://github.com/user-attachments/assets/b9021107-7b2f-4ded-babd-8db485770b72" alt="Peplink SMS Bootstrap Frontend UI" width="800">
</picture>

## Node Application

`/app` contains an Express + SQLite server that serves the finished frontend and persists the router setup information collected on the `setup.html` page. To run it locally:

```bash
cd app
npm install
npm run dev
```

Visit http://localhost:3000 to go through the setup screen and continue into the messaging UI. The SQLite database lives under `app/data/peplink_sms.db` and is ignored by Git.

## Purpose

## Installation

### Local Node

```bash
cd app
npm install
npm run dev
```

### Docker Compose

You can run the backend + frontend via Docker using the provided `docker-compose.yml`.

```bash
docker compose up --build
```

The server will listen on http://localhost:3000 (override with `PORT` env). The SQLite database is stored in the `peplink_sms_data` Docker volume for persistence.

## Usage

## Donate
