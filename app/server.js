const path = require('path');
const express = require('express');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { getSettings, saveSettings } = require('./db');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const frontendDir = path.join(__dirname, '..', 'bootstrap-frontend');

app.use(morgan('dev'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(frontendDir));

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', async (req, res, next) => {
    try {
        const settings = await getSettings();
        if (!settings) {
            return res.redirect('/setup');
        }
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
        
        await saveSettings({
            username: setupUsername,
            password: setupPassword,
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

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: 'Internal Server Error' });
});

app.listen(PORT, () => {
    console.log(`Peplink SMS app listening on http://localhost:${PORT}`);
});
