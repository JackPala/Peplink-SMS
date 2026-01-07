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
            api_client_id TEXT,
            api_client_secret TEXT,
            api_access_token TEXT,
            api_token_expires_at TEXT,
            api_auth_mode TEXT DEFAULT 'token',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);
    ensureColumn('settings', 'api_client_id', 'TEXT');
    ensureColumn('settings', 'api_client_secret', 'TEXT');
    ensureColumn('settings', 'api_access_token', 'TEXT');
    ensureColumn('settings', 'api_token_expires_at', 'TEXT');
    ensureColumn('settings', 'api_auth_mode', 'TEXT');

    db.run(`
        CREATE TABLE IF NOT EXISTS sms_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conn_id INTEGER NOT NULL,
            sim_id INTEGER,
            sender TEXT NOT NULL,
            message_id INTEGER NOT NULL,
            timestamp INTEGER,
            date TEXT,
            length INTEGER,
            content TEXT,
            direction TEXT DEFAULT 'received',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(conn_id, sim_id, message_id)
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

async function saveSettings(payload) {
    const current = await getSettings();
    if (!current && (!payload.username || !payload.password || !payload.router_ip || !payload.router_username || !payload.router_password)) {
        throw new Error('Missing required fields for initial setup');
    }
    
    const data = {
        username: resolveField('username'),
        password: resolveField('password'),
        router_ip: resolveField('router_ip'),
        router_username: resolveField('router_username'),
        router_password: resolveField('router_password'),
        api_client_id: resolveField('api_client_id'),
        api_client_secret: resolveField('api_client_secret'),
        api_access_token: resolveField('api_access_token'),
        api_token_expires_at: resolveField('api_token_expires_at'),
        api_auth_mode: resolveField('api_auth_mode', 'token') || 'token'
    };
    
    return new Promise((resolve, reject) => {
        const stmt = `
            INSERT INTO settings (
                id,
                username,
                password,
                router_ip,
                router_username,
                router_password,
                api_client_id,
                api_client_secret,
                api_access_token,
                api_token_expires_at,
                api_auth_mode
            )
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                username = excluded.username,
                password = excluded.password,
                router_ip = excluded.router_ip,
                router_username = excluded.router_username,
                router_password = excluded.router_password,
                api_client_id = excluded.api_client_id,
                api_client_secret = excluded.api_client_secret,
                api_access_token = excluded.api_access_token,
                api_token_expires_at = excluded.api_token_expires_at,
                api_auth_mode = excluded.api_auth_mode,
                updated_at = CURRENT_TIMESTAMP
        `;
        
        const params = [
            data.username,
            data.password,
            data.router_ip,
            data.router_username,
            data.router_password,
            data.api_client_id,
            data.api_client_secret,
            data.api_access_token,
            data.api_token_expires_at,
            data.api_auth_mode
        ];
        
        db.run(stmt, params, function(err) {
            if (err) {
                reject(err);
                return;
            }
            resolve();
        });
    });
    
    function resolveField(field, fallback = null) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
            return payload[field];
        }
        if (current && Object.prototype.hasOwnProperty.call(current, field)) {
            return current[field];
        }
        return fallback;
    }
}

function saveSmsMessages(messages = []) {
    if (!Array.isArray(messages) || messages.length === 0) {
        return Promise.resolve();
    }
    
    const stmt = `
        INSERT INTO sms_messages (
            conn_id,
            sim_id,
            sender,
            message_id,
            timestamp,
            date,
            length,
            content,
            direction,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(conn_id, sim_id, message_id) DO UPDATE SET
            sender = excluded.sender,
            timestamp = excluded.timestamp,
            date = excluded.date,
            length = excluded.length,
            content = excluded.content,
            direction = excluded.direction,
            updated_at = CURRENT_TIMESTAMP
    `;
    
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            const prepared = db.prepare(stmt, err => {
                if (err) {
                    reject(err);
                }
            });
            
            if (!prepared) {
                return;
            }
            
            let firstError = null;
            messages.forEach(msg => {
                prepared.run([
                    msg.conn_id,
                    msg.sim_id,
                    msg.sender,
                    msg.message_id,
                    msg.timestamp ?? null,
                    msg.date ?? null,
                    msg.length ?? null,
                    msg.content ?? '',
                    msg.direction ?? 'received'
                ], err => {
                    if (err && !firstError) {
                        firstError = err;
                    }
                });
            });
            
            prepared.finalize(err => {
                if (firstError || err) {
                    reject(firstError || err);
                    return;
                }
                resolve();
            });
        });
    });
}

function getSmsConversations() {
    return new Promise((resolve, reject) => {
        const query = `
            SELECT
                id,
                conn_id,
                sim_id,
                sender,
                message_id,
                timestamp,
                date,
                length,
                content,
                direction
            FROM sms_messages
            ORDER BY sender ASC, timestamp ASC, message_id ASC, id ASC
        `;
        
        db.all(query, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }
            
            const conversations = {};
            rows.forEach(row => {
                if (!conversations[row.sender]) {
                    conversations[row.sender] = [];
                }
                conversations[row.sender].push({
                    id: row.id,
                    connId: row.conn_id,
                    simId: row.sim_id,
                    routerMessageId: row.message_id,
                    timestamp: row.timestamp,
                    date: row.date,
                    length: row.length,
                    content: row.content,
                    direction: row.direction || 'received'
                });
            });
            
            const formatted = Object.entries(conversations).map(([sender, messages]) => {
                const latestTimestamp = Math.max(...messages.map(msg => msg.timestamp || 0), 0);
                return {
                    sender,
                    latestTimestamp: latestTimestamp || null,
                    messages
                };
            }).sort((a, b) => {
                if (b.latestTimestamp === a.latestTimestamp) {
                    return a.sender.localeCompare(b.sender);
                }
                return (b.latestTimestamp || 0) - (a.latestTimestamp || 0);
            });
            
            resolve(formatted);
        });
    });
}

function getLatestMessageBySender(sender) {
    return new Promise((resolve, reject) => {
        db.get(
            `
                SELECT *
                FROM sms_messages
                WHERE sender = ?
                ORDER BY timestamp DESC, id DESC
                LIMIT 1
            `,
            [sender],
            (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row || null);
            }
        );
    });
}

function ensureColumn(table, column, type) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`, err => {
        if (err && !err.message.includes('duplicate column name')) {
            console.error(`Failed to add column ${column} on ${table}`, err.message);
        }
    });
}

module.exports = {
    db,
    getSettings,
    saveSettings,
    saveSmsMessages,
    getSmsConversations,
    getLatestMessageBySender
};
