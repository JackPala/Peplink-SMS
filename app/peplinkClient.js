const axios = require('axios');
const https = require('https');

class PeplinkClient {
    constructor({ baseUrl, username, password }) {
        this.baseUrl = baseUrl.replace(/\/$/, '');
        this.username = username;
        this.password = password;
        this.sessionCookie = null;
        this.http = axios.create({
            baseURL: this.baseUrl,
            timeout: 10000,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            validateStatus: () => true
        });
    }

    async login() {
        const response = await this.http.post('/api/login', {
            username: this.username,
            password: this.password
        });

        this.ensureOk(response, 'login');

        const cookieHeader = response.headers['set-cookie'];
        if (!cookieHeader || cookieHeader.length === 0) {
            throw new Error('Router login succeeded but no session cookie was returned');
        }

        this.sessionCookie = Array.isArray(cookieHeader) ? cookieHeader.map(cookie => cookie.split(';')[0]).join('; ') : cookieHeader;
        return this.sessionCookie;
    }

    async ensureSession() {
        if (!this.sessionCookie) {
            await this.login();
        }
        return this.sessionCookie;
    }

    async createApiClient(name = 'Peplink SMS Agent') {
        await this.ensureSession();

        const response = await this.http.post('/api/auth.client', {
            name,
            scope: 'api'
        }, {
            headers: {
                Cookie: this.sessionCookie
            }
        });

        this.ensureOk(response, 'auth.client');
        return response.data.response;
    }

    async grantToken(clientId, clientSecret) {
        const response = await this.http.post('/api/auth.token.grant', {
            clientId,
            clientSecret
        });

        this.ensureOk(response, 'auth.token.grant');
        return response.data.response;
    }

    async getWanStatus(authOptions = {}) {
        const config = await this.buildAuthConfig(authOptions);
        const response = await this.http.get('/api/status.wan.connection', config);

        this.ensureOk(response, 'status.wan.connection');
        return response.data.response;
    }

    async getCellularConnectionIds(authOptions = {}) {
        const status = await this.getWanStatus(authOptions);
        const order = status.order || [];
        return order.filter(id => {
            const wan = status[id];
            return wan && (wan.type === 'cellular' || wan.type === 'gobi');
        });
    }

    async getSmsMessages(connId, authOptions = {}) {
        const config = await this.buildAuthConfig(authOptions);
        config.params = {
            ...(config.params || {}),
            connId
        };
        const response = await this.http.get('/api/cmd.sms.get', config);

        this.ensureOk(response, 'cmd.sms.get');
        return response.data.response;
    }

    async sendSms(payload, authOptions = {}) {
        const config = await this.buildAuthConfig(authOptions);
        const response = await this.http.post('/api/cmd.sms.sendMessage', payload, config);
        this.ensureOk(response, 'cmd.sms.sendMessage');
        return response.data;
    }

    ensureOk(response, context) {
        if (!response || !response.data) {
            throw new Error(`No response received from router during ${context}`);
        }

        if (response.data.stat !== 'ok') {
            const message = response.data.message || `Peplink API returned a failure (context: ${context})`;
            throw new Error(message);
        }
    }

    async buildAuthConfig(authOptions = {}) {
        const { accessToken } = authOptions;
        const config = {};

        if (accessToken) {
            config.params = {
                ...(authOptions.params || {}),
                accessToken
            };
            if (authOptions.headers) {
                config.headers = { ...authOptions.headers };
            }
            return config;
        }

        await this.ensureSession();
        config.headers = {
            ...(authOptions.headers || {}),
            Cookie: this.sessionCookie
        };

        if (authOptions.params) {
            config.params = { ...authOptions.params };
        }

        return config;
    }
}

module.exports = PeplinkClient;
