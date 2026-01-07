const { getSettings, saveSettings, saveSmsMessages, getLatestMessageBySender } = require('./db');
const PeplinkClient = require('./peplinkClient');

const TOKEN_EXPIRY_BUFFER_MS = 2 * 60 * 1000;

async function runInitialRouterSetup() {
    const settings = await getSettings();
    if (!settings) {
        throw new Error('Application settings were not found. Please run setup again.');
    }

    const client = createClientFromSettings(settings);
    const authState = await ensureApiClient(client, settings);
    const refreshedSettings = await getSettings();
    if (authState.mode === 'token') {
        await ensureAccessToken(client, refreshedSettings, { forceRefresh: true });
    }
    return syncSmsFromRouter();
}

async function syncSmsFromRouter() {
    const settings = await getSettings();
    if (!settings) {
        throw new Error('Application is not configured yet.');
    }

    const client = createClientFromSettings(settings);
    const authState = await ensureApiClient(client, settings);
    const latestSettings = await getSettings();

    let authOptions = {};
    if (authState.mode === 'token') {
        const { token } = await ensureAccessToken(client, latestSettings);
        authOptions = { accessToken: token };
    } else {
        await client.ensureSession();
    }

    const connIds = await client.getCellularConnectionIds(authOptions);

    const smsRecords = [];
    for (const connId of connIds) {
        try {
            const smsResponse = await client.getSmsMessages(connId, authOptions);
            if (!smsResponse || !Array.isArray(smsResponse.sms)) {
                continue;
            }
            
            const simId = smsResponse.simId || null;
            const responseConnId = smsResponse.connId ?? connId;
            
            smsResponse.sms.forEach(conversation => {
                const sender = conversation.sender || 'Unknown';
                const combinedMessages = combineConversationMessages(conversation.message || []);
                combinedMessages.forEach(combined => {
                    smsRecords.push({
                        conn_id: responseConnId,
                        sim_id: simId,
                        sender,
                        message_id: combined.id,
                        timestamp: combined.timestamp,
                        date: combined.date,
                        length: combined.length,
                        content: combined.content,
                        direction: 'received'
                    });
                });
            });
        } catch (error) {
            console.error(`Failed to fetch SMS for connection ${connId}`, error.message || error);
        }
    }

    await saveSmsMessages(smsRecords);

    return {
        connectionsChecked: connIds.length,
        messagesStored: smsRecords.length
    };
}

function createClientFromSettings(settings) {
    const baseUrl = buildRouterBaseUrl(settings.router_ip);
    return new PeplinkClient({
        baseUrl,
        username: settings.router_username,
        password: settings.router_password
    });
}

async function ensureApiClient(client, settings) {
    const currentMode = (settings.api_auth_mode || 'token').toLowerCase();
    if (currentMode === 'session') {
        return { mode: 'session' };
    }

    if (settings.api_client_id && settings.api_client_secret) {
        return {
            mode: 'token',
            clientId: settings.api_client_id,
            clientSecret: settings.api_client_secret
        };
    }

    try {
        const response = await client.createApiClient(`Peplink SMS Agent ${Date.now()}`);
        if (!response || !response.clientId || !response.clientSecret) {
            throw new Error('Router did not return API client credentials');
        }
    
        await saveSettings({
            api_client_id: response.clientId,
            api_client_secret: response.clientSecret,
            api_auth_mode: 'token'
        });
    
        return {
            mode: 'token',
            clientId: response.clientId,
            clientSecret: response.clientSecret
        };
    } catch (error) {
        if (isUnsupportedActionError(error)) {
            await saveSettings({
                api_auth_mode: 'session',
                api_client_id: null,
                api_client_secret: null,
                api_access_token: null,
                api_token_expires_at: null
            });
            return { mode: 'session' };
        }
        throw error;
    }
}

async function ensureAccessToken(client, settings, options = {}) {
    if ((settings.api_auth_mode || 'token').toLowerCase() === 'session') {
        return { token: null, expiresAt: null };
    }
    
    const forceRefresh = options.forceRefresh || false;
    const expiresAt = settings.api_token_expires_at ? Date.parse(settings.api_token_expires_at) : 0;
    const hasValidToken = settings.api_access_token && expiresAt && (expiresAt - Date.now() > TOKEN_EXPIRY_BUFFER_MS);

    if (!forceRefresh && hasValidToken) {
        return {
            token: settings.api_access_token,
            expiresAt
        };
    }

    if (!settings.api_client_id || !settings.api_client_secret) {
        throw new Error('API client credentials are missing. Please run the setup again.');
    }

    const response = await client.grantToken(settings.api_client_id, settings.api_client_secret);
    if (!response || !response.accessToken) {
        throw new Error('Failed to obtain API access token from the router');
    }

    const expiresIn = response.expiresIn || 0;
    const absoluteExpiry = new Date(Date.now() + expiresIn * 1000);

    await saveSettings({
        api_access_token: response.accessToken,
        api_token_expires_at: absoluteExpiry.toISOString()
    });

    return {
        token: response.accessToken,
        expiresAt: absoluteExpiry.getTime()
    };
}

function buildRouterBaseUrl(routerIp) {
    const trimmed = (routerIp || '').trim();
    if (!trimmed) {
        throw new Error('Router IP/hostname is missing from settings');
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed.replace(/^http:\/\//i, 'https://');
    }

    return `https://${trimmed}`;
}

function isUnsupportedActionError(error) {
    if (!error || !error.message) {
        return false;
    }
    return /unsupported action/i.test(error.message) || /unknown action/i.test(error.message);
}

function combineConversationMessages(messageParts = []) {
    if (!Array.isArray(messageParts) || messageParts.length === 0) {
        return [];
    }

    const groupedMessages = [];
    let currentGroup = [];
    let currentKey = null;

    messageParts.forEach(part => {
        const groupKey = buildGroupKey(part);
        if (currentKey === null || groupKey === currentKey) {
            currentGroup.push(part);
            currentKey = groupKey;
        } else {
            const combined = buildCombinedMessage(currentGroup);
            if (combined) {
                groupedMessages.push(combined);
            }
            currentGroup = [part];
            currentKey = groupKey;
        }
    });

    if (currentGroup.length > 0) {
        const combined = buildCombinedMessage(currentGroup);
        if (combined) {
            groupedMessages.push(combined);
        }
    }

    return groupedMessages;
}

function normalizePartId(id, fallback) {
    if (typeof id === 'number' && Number.isFinite(id)) {
        return id;
    }
    const parsed = parseInt(id, 10);
    if (Number.isNaN(parsed)) {
        return fallback;
    }
    return parsed;
}

function buildMessageHash(parts, content) {
    const signature = `${content}|${parts.map(part => part.timestamp ?? '').join(',')}`;
    let hash = 0;
    for (let i = 0; i < signature.length; i += 1) {
        hash = (hash * 31 + signature.charCodeAt(i)) >>> 0;
    }
    return hash || Date.now();
}

function buildGroupKey(part) {
    if (typeof part.timestamp === 'number') {
        return `ts:${part.timestamp}`;
    }
    if (part.date) {
        return `date:${part.date}`;
    }
    return `id:${normalizePartId(part.id, Date.now())}`;
}

function buildCombinedMessage(parts) {
    if (!parts || parts.length === 0) {
        return null;
    }

    const combinedText = parts.map(part => (typeof part.content === 'string' ? part.content : '')).join('');
    const firstPart = parts[0];
    const hashSeed = buildMessageHash(parts, combinedText);
    const messageId = normalizePartId(firstPart?.id, hashSeed);

    return {
        id: messageId,
        timestamp: typeof firstPart?.timestamp === 'number' ? firstPart.timestamp : null,
        date: firstPart?.date ?? null,
        length: combinedText.length,
        content: combinedText
    };
}

async function sendSmsMessage({ recipient, content, connId }) {
    if (!recipient || !content) {
        throw new Error('Recipient and message content are required.');
    }

    const settings = await getSettings();
    if (!settings) {
        throw new Error('Application is not configured yet.');
    }

    const client = createClientFromSettings(settings);
    const authState = await ensureApiClient(client, settings);
    const refreshedSettings = await getSettings();

    let authOptions = {};
    if (authState.mode === 'token') {
        const { token } = await ensureAccessToken(client, refreshedSettings);
        authOptions = { accessToken: token };
    } else {
        await client.ensureSession();
    }

    let targetConnId = connId;
    if (!targetConnId) {
        const latest = await getLatestMessageBySender(recipient);
        if (latest && latest.conn_id) {
            targetConnId = latest.conn_id;
        }
    }

    if (!targetConnId) {
        const connIds = await client.getCellularConnectionIds(authOptions);
        if (connIds.length === 0) {
            throw new Error('No cellular connections available to send SMS.');
        }
        targetConnId = connIds[0];
    }

    await client.sendSms({
        address: recipient,
        content,
        connId: targetConnId
    }, authOptions);

    const now = new Date();
    await saveSmsMessages([{
        conn_id: targetConnId,
        sim_id: null,
        sender: recipient,
        message_id: now.getTime(),
        timestamp: Math.floor(now.getTime() / 1000),
        date: now.toISOString(),
        length: content.length,
        content,
        direction: 'sent'
    }]);

    return {
        connId: targetConnId,
        sentAt: now.toISOString()
    };
}

module.exports = {
    runInitialRouterSetup,
    syncSmsFromRouter,
    sendSmsMessage
};
