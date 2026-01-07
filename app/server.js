const path = require('path');
const express = require('express');
const morgan = require('morgan');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { getSettings, saveSettings } = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'bootstrap-frontend');
const BASIC_REALM = 'Peplink SMS';

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(loadSettings);
app.use(handleSetupFlow);
app.use(requireBasicAuth);
app.use(express.static(frontendDir));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', async (req, res, next) => {
    try {
        res.sendFile(path.join(frontendDir, 'index.html'));
    } catch (error) {
        next(error);
    }
});

app.get('/setup', async (req, res, next) => {
    try {
        res.sendFile(path.join(frontendDir, 'setup.html'));
    } catch (error) {
        next(error);
    }
});

app.post('/setup', async (req, res, next) => {
    try {
        const {
            setupUsername,
            setupPassword,
            routerIp,
            routerUsername,
            routerPassword
        } = req.body;
        
        if (!setupUsername || !setupPassword || !routerIp || !routerUsername || !routerPassword) {
            return res.status(400).json({ message: 'All fields are required.' });
        }
        
        const passwordHash = await bcrypt.hash(setupPassword, 12);
        
        await saveSettings({
            username: setupUsername,
            password: passwordHash,
            router_ip: routerIp,
            router_username: routerUsername,
            router_password: routerPassword
        });
        
        res.redirect('/');
    } catch (error) {
        next(error);
    }
});

app.get('/api/settings', async (req, res, next) => {
    try {
        const settings = await getSettings();
        if (!settings) {
            return res.status(404).json({ message: 'No setup data found.' });
        }
        res.json({
            username: settings.username,
            router_ip: settings.router_ip,
            router_username: settings.router_username,
            created_at: settings.created_at,
            updated_at: settings.updated_at
        });
    } catch (error) {
        next(error);
    }
});

app.get('/logout', (req, res) => {
    res.set('WWW-Authenticate', `Basic realm="${BASIC_REALM}", charset="UTF-8"`);
    res.status(401).send('Logged out');
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`Peplink SMS app listening on http://localhost:${PORT}`);
});

function loadSettings(req, res, next) {
    getSettings()
        .then(settings => {
            req.appSettings = settings;
            next();
        })
        .catch(next);
}

function handleSetupFlow(req, res, next) {
    const settings = req.appSettings;
    const isSetupRoute = req.path === '/setup';
    const isSetupMethodAllowed = isSetupRoute && (req.method === 'GET' || req.method === 'POST');
    const isStaticRequestDuringSetup = !settings && isStaticAssetRequest(req);
    const isHealthCheck = req.path === '/health';
    
    if (!settings) {
        if (isSetupMethodAllowed || isStaticRequestDuringSetup || isHealthCheck) {
            return next();
        }
        return res.redirect('/setup');
    }
    
    if (settings && isSetupRoute && req.method === 'GET') {
        return res.redirect('/');
    }
    
    next();
}

function requireBasicAuth(req, res, next) {
    const settings = req.appSettings;
    if (!settings) {
        return next();
    }
    
    const openPaths = ['/health', '/logout'];
    const isSetupPost = req.path === '/setup' && req.method === 'POST';
    if (openPaths.includes(req.path) || isSetupPost) {
        return next();
    }
    
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Basic ')) {
        return challenge(res);
    }
    
    const base64Credentials = authHeader.replace('Basic ', '');
    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf8');
    const separatorIndex = credentials.indexOf(':');
    
    if (separatorIndex === -1) {
        return challenge(res);
    }
    
    const providedUsername = credentials.slice(0, separatorIndex);
    const providedPassword = credentials.slice(separatorIndex + 1);
    
    if (providedUsername !== settings.username) {
        return challenge(res);
    }
    
    const storedPassword = settings.password || '';
    if (isBcryptHash(storedPassword)) {
        bcrypt.compare(providedPassword, storedPassword)
            .then(match => {
                if (!match) {
                    return challenge(res);
                }
                next();
            })
            .catch(next);
    } else {
        if (providedPassword !== storedPassword) {
            return challenge(res);
        }
        
        bcrypt.hash(providedPassword, 12)
            .then(hash => saveSettings({
                username: settings.username,
                password: hash,
                router_ip: settings.router_ip,
                router_username: settings.router_username,
                router_password: settings.router_password
            }))
            .catch(err => {
                console.error('Failed to upgrade password hash', err);
            })
            .finally(() => next());
    }
}

function challenge(res) {
    res.set('WWW-Authenticate', `Basic realm="${BASIC_REALM}", charset="UTF-8"`);
    return res.status(401).send('Authentication required');
}

function isStaticAssetRequest(req) {
    if (req.method !== 'GET') {
        return false;
    }
    
    if (req.path.startsWith('/assets/')) {
        return true;
    }
    
    return /\.(css|js|png|webp|ico|svg|jpg|jpeg|woff|woff2|ttf)$/.test(req.path);
}

function isBcryptHash(value) {
    return value.startsWith('$2a$') || value.startsWith('$2b$') || value.startsWith('$2y$');
}
