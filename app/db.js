const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'peplink_sms.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            username TEXT NOT NULL,
            password TEXT NOT NULL,
            router_ip TEXT NOT NULL,
            router_username TEXT NOT NULL,
            router_password TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
});

function getSettings() {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM settings WHERE id = 1', (err, row) => {
            if (err) {
                reject(err);
                return;
            }
            resolve(row || null);
        });
    });
}

function saveSettings(payload) {
    const { username, password, router_ip, router_username, router_password } = payload;
    
    return new Promise((resolve, reject) => {
        const stmt = `
            INSERT INTO settings (id, username, password, router_ip, router_username, router_password)
            VALUES (1, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                password = excluded.password,
                router_ip = excluded.router_ip,
                router_username = excluded.router_username,
                router_password = excluded.router_password,
                updated_at = CURRENT_TIMESTAMP
        `;
        
        db.run(stmt, [username, password, router_ip, router_username, router_password], function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
}

module.exports = {
    db,
    getSettings,
    saveSettings
};
