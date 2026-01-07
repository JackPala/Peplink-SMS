Instructions Relating to the Peplink API:

The following is information relating to the way to connect to the Peplink Local Router API. Never try to use Cloud stuff such as Incontrol2, this is a fully local application.

Introduction

This guide covers how to build an autonomous Node.js agent that interacts with a Peplink Balance One (B1) router via its local API, without using InControl2. We will detail authentication methods, how to query cellular WAN interfaces and SIM slots, and how to read/send SMS messages through the router’s API. Code snippets (using Node.js with Axios or Fetch) are provided for each step, along with strategies for error handling, polling, and maintaining long-running sessions.

1. Local API Authentication

Peplink’s local API supports two authentication methods: session-based login (using admin username/password with a session cookie) and token-based authentication (using an API client ID and secret to obtain an access token). We’ll explain both in detail, including how to handle cookies or tokens in Node.js.

1.1 Session-Based Login (POST /api/login)

Session-based authentication uses the same mechanism as the Web Admin UI. You send the admin username and password to the router’s /api/login endpoint, and upon success the router returns a session cookie (often called pauth) that must be included in subsequent requests
download.peplink.com
forum.peplink.com
. Key points for session login:

Login Request: Send a POST to https://<router IP>/api/login with JSON body {"username":"<admin>","password":"<pass>"}. A successful response will have "stat": "ok" and include a cookie in the headers (e.g. Set-Cookie: pauth=<session_id>; path=/api; HttpOnly)
download.peplink.com
. The JSON response also contains a permission object indicating the granted rights (e.g. GET=1, POST=1 for an admin)
download.peplink.com
.

Session Cookie: Save the session cookie from the Set-Cookie header. This cookie represents your authenticated session and must be sent with each subsequent API request (e.g. via an HTTP Cookie header). The session will timeout if idle, similar to a web admin session
download.peplink.com
. It’s good practice to log out with /api/logout when done, though for an autonomous agent you may maintain the session until expiration.

Example – Login with Axios: Below is a Node.js snippet using Axios to log in and store the cookie for subsequent calls:

const axios = require('axios');
const routerUrl = 'https://192.168.1.1';  // use HTTPS and your router’s IP/hostname
async function login() {
  const credentials = { username: "admin", password: "yourAdminPassword" };
  const res = await axios.post(`${routerUrl}/api/login`, credentials, { validateStatus: () => true });
  if (res.data.stat === "ok") {
    // Extract session cookie (pauth) from response headers
    const setCookie = res.headers['set-cookie'];
    const sessionCookie = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
    console.log("Logged in. Session cookie:", sessionCookie);
    return sessionCookie;
  } else {
    throw new Error(`Login failed: ${res.data.message || 'Unknown error'}`);
  }
}


Using the Session: Once you have the sessionCookie, include it in a Cookie header for future requests. For example:

const cookie = await login();
const smsResp = await axios.get(`${routerUrl}/api/cmd.sms.get`, {
  params: { connId: 6 },
  headers: { Cookie: cookie }
});
console.log(smsResp.data);


The axios instance will send the cookie with the request, allowing the API call to succeed under the authenticated session. (Alternatively, you can use a library or Axios interceptor to automatically handle cookies.)

Note: The session cookie will expire according to the router’s session timeout settings
download.peplink.com
. If the agent runs continuously, be prepared to re-authenticate (login again) if you receive an authorization error. For long-term or headless operation, consider the token-based method below for a more persistent authentication that doesn’t rely on an interactive session
download.peplink.com
.

1.2 Token-Based Authentication (Client ID & Access Token)

Token-based authentication uses API “clients” and tokens, similar to an OAuth2 Client Credentials flow
download.peplink.com
. This allows your agent to use an access token in lieu of a username/password, which is useful for long-running processes. Tokens are valid for a fixed period (48 hours by default) and must be refreshed periodically
forum.peplink.com
. The general process is:

Create an API Client (one-time): Using an admin session, call POST /api/auth.client to register a new API client (supply a client name and scope). For example, sending {"name": "MyAgent", "scope": "api"} will create a client with full read-write API scope
download.peplink.com
. The response will include a generated clientId and clientSecret
forum.peplink.com
download.peplink.com
. (You only need to do this once and can reuse the same client credentials; store them securely.)

Generate an Access Token: Call POST /api/auth.token.grant with the clientId and clientSecret (and optionally a scope) to obtain an access token
forum.peplink.com
. For example:

const tokenRes = await axios.post(`${routerUrl}/api/auth.token.grant`, {
  clientId: "<your_clientId>",
  clientSecret: "<your_clientSecret>",
  // scope: "api"  // optional, defaults to client’s scope
});
if (tokenRes.data.stat === "ok") {
  const accessToken = tokenRes.data.response.accessToken;
  const expiresIn = tokenRes.data.response.expiresIn;  // e.g. 172800 seconds (48h)
  console.log("Token acquired:", accessToken, "valid for", expiresIn, "seconds");
}


A successful response returns "accessToken" (a 32-character hash string) and an "expiresIn" (in seconds) indicating its lifetime
forum.peplink.com
. Tokens typically expire after 48 hours (172800 seconds)
forum.peplink.com
, so your agent should refresh the token before expiration (e.g. by calling the grant API again, or by scheduling the token request every 2 days).

Using the Access Token: Once you have an access token, include it in each API request. The router accepts the token via a query parameter or header. The simplest method is to append ?accessToken=<token> to your API URL
download.peplink.com
. For example:

const accessToken = "<your_access_token>";
const resp = await axios.get(`${routerUrl}/api/status.wan.connection`, {
  params: { accessToken: accessToken }
});
console.log(resp.data);


This call will be authorized without needing a cookie or login session. You can similarly include accessToken in POST requests (as a URL parameter or by adding it in the JSON body if the API supports, but query param is simplest). Ensure you do not expose the token publicly, as it grants API access.

Token Renewal: Because tokens expire after a fixed time, implement a renewal strategy. Your agent can store the expiresIn timestamp and request a new token (using the saved clientId and clientSecret) a little before expiry. If an API call returns an authentication error (e.g. "stat": "fail", "code": 401 indicating an invalid/expired token), the agent should obtain a new token via /api/auth.token.grant and continue.

Note: In some firmware versions, an endpoint like /api/auth.token.create may be available to directly create a token for a logged-in user session (bypassing the need for a client secret). However, the recommended approach is to use the client ID & secret method above, which avoids storing user passwords and is designed for persistent integrations
download.peplink.com
. After the initial setup (creating the client and token), your Node.js agent can operate solely with the access token, without further interactive logins.

2. Detecting Active SIMs and Cellular WAN Interfaces

To send or receive SMS, the agent needs to identify the router’s cellular WAN interface(s) and SIM status. Peplink devices use connection IDs (connId) to identify each WAN (wired or cellular). We need to find all WANs that are cellular and determine which SIM slots are active for those connections.

Listing WAN Connections: Use GET /api/status.wan.connection to retrieve the status of all WAN interfaces. By default, this returns a JSON object containing each WAN’s data keyed by its connId
download.peplink.com
download.peplink.com
. Each WAN entry includes properties like its name, status, uptime, and importantly the type. For cellular interfaces, type will be "cellular" (older firmware might label it "gobi", but on current firmware 8.0.1+ it shows "cellular")
download.peplink.com
. For example:

{
  "stat": "ok",
  "response": {
    "order": [1, 2, 3],
    "1": { ... "type": "ethernet", "name": "WAN 1", ... },
    "2": { ... "type": "cellular", "name": "Cellular 1", ... },
    "3": { ... "type": "ethernet", "name": "WAN 2", ... }
  }
}


In this example, connId=2 corresponds to a cellular WAN (Cellular 1). There could be multiple cellular WANs (e.g. connId=2 and connId=3 both being cellular on a multi-modem device). To detect them:

Identify Cellular WANs: Filter the /api/status.wan.connection response for entries where "type": "cellular"
download.peplink.com
. Collect their connId values. These are the WAN interface IDs you will use for SMS commands.

Detect Multi-SIM Setups: Some devices (like MAX series or Balance One with a cellular module) have dual SIM slots (SIM A/SIM B) per cellular modem, with one slot active at a time. The WAN status API provides a cellular or SIM info section that lists SIM details. Look for a structure like ... "sim": { "order": [1, 2], "1": {...}, "2": {...} } within the cellular WAN’s status. Each SIM slot is represented by an ID (1 or 2) and has fields like status and active. For example, status might be "In Use" or "SIM Card Detected", and an active: true flag indicates which SIM is currently in use
download.peplink.com
. The sim object’s order array lists the SIM slot IDs available
download.peplink.com
download.peplink.com
.

Using this data, your agent can determine if a cellular WAN has two SIMs and which one is active. Typically:

If a SIM slot’s status is “In Use” and active: true, that SIM is currently active (the one providing connectivity)
download.peplink.com
.

The other slot may show “SIM Card Detected” (if a card is present but not active) or “No SIM Card” if empty
download.peplink.com
.

Example – Listing Cellular WANs (Node.js):

async function getCellularConnIds(auth) {
  // `auth` could be a cookie string for session or an accessToken parameter object
  const resp = await axios.get(`${routerUrl}/api/status.wan.connection`, auth);
  if (resp.data.stat !== 'ok') {
    throw new Error(`Failed to get WAN status: ${resp.data.message || resp.status}`);
  }
  const data = resp.data.response;
  const cellularIds = [];
  for (const id of data.order) {
    const wan = data[id];
    if (wan.type === 'cellular') {
      cellularIds.push(id);
      const simInfo = wan.cellular || wan.modem;  // depending on firmware, use 'cellular'
      if (simInfo && simInfo.sim) {
        // Check SIM slots
        for (const simId of simInfo.sim.order || []) {
          const sim = simInfo.sim[simId];
          console.log(`WAN ${id} SIM${simId}: status=${sim.status}, active=${sim.active}`);
        }
      }
    }
  }
  return cellularIds;
}


This code fetches all WAN statuses and logs SIM slot information for each cellular WAN. For instance, it might output: “WAN 2 SIM1: status=In Use, active=true” and “WAN 2 SIM2: status=SIM Card Detected, active=false”, indicating WAN 2 has two SIMs with SIM1 currently active. The active SIM’s slot number will correspond to the simId you see in SMS APIs (discussed next).

3. Reading SMS Messages

Peplink devices with cellular capability can receive and store SMS messages (often up to 20 messages max on the device). To retrieve SMS messages via the API, use the endpoint GET /api/cmd.sms.get. This endpoint returns messages from the active SIM on a given WAN (specified by its connId)
download.peplink.com
download.peplink.com
.

Usage: GET /api/cmd.sms.get?connId=<id> – where <id> is the connection ID of the cellular WAN interface. The response will include: the connId you queried, the simId (SIM slot number 1 or 2 for that WAN), and an array of SMS messages
download.peplink.com
. Each SMS is represented as an object with the sender’s number, and a list of message parts
download.peplink.com
download.peplink.com
. The structure groups messages by sender. For example:

{
  "stat": "ok",
  "response": {
    "connId": 6,
    "simId": 1,
    "sms": [
      {
        "sender": "988",
        "message": [
          {
            "id": 1,
            "date": "Feb 17 13:55",
            "timestamp": 1581774925,
            "length": 50,
            "content": "This is the 1st line of SMS,\nand this is the 2nd line."
          }
        ]
      },
      {
        "sender": "+81325359875",
        "message": [
          {
            "id": 2,
            "date": "Feb 05 01:55",
            "timestamp": 1580867113,
            "length": 24,
            "content": "Multipart message part 1"
          },
          {
            "id": 6,
            "date": "Feb 05 01:55",
            "timestamp": 1580867113,
            "length": 24,
            "content": "Multipart message part 2"
          }
        ]
      }
    ]
  }
}


In this example, the router (connId 6, SIM slot 1) has messages from sender 988 and from +81325359875. The second sender’s message was split into two parts (id 2 and 6) which are grouped together. Key fields for each SMS part include: id (message index), date (human-readable date), timestamp (Unix time), length (number of characters), and content (the text)
download.peplink.com
. The top-level sender is the phone number or identifier of who sent the SMS.

Retrieving SMS for All SIMs: Your agent should loop through all identified cellular connIds (from section 2) and call /api/cmd.sms.get for each. If a device has multiple modems or SIMs, you’ll need to query each separately. The simId in the response tells you which SIM’s messages you’re viewing (useful if the device can switch SIMs – you’d get separate sets of messages depending on the active SIM). Typically, the API fetches messages from the currently active SIM of that WAN
download.peplink.com
download.peplink.com
. If the router has recently switched SIM slots, you may need to query again after the switch (since the messages are stored per SIM).

Example – Reading SMS (Node.js):

async function readAllSms(cookieOrToken) {
  const cellularIds = await getCellularConnIds(cookieOrToken);
  for (const id of cellularIds) {
    const res = await axios.get(`${routerUrl}/api/cmd.sms.get`, {
      params: { connId: id },
      headers: cookieOrToken.headers || {}  // e.g. { Cookie: sessionCookie } or include accessToken in params
    });
    if (res.data.stat !== 'ok') {
      console.error(`Failed to get SMS for WAN ${id}:`, res.data.message);
      continue;
    }
    const smsData = res.data.response;
    console.log(`\nSMS messages on WAN ${smsData.connId} (SIM slot ${smsData.simId}):`);
    for (const msgGroup of smsData.sms) {
      const from = msgGroup.sender;
      for (const msg of msgGroup.message) {
        console.log(`- [${new Date(msg.timestamp * 1000).toISOString()}] SMS from ${from}: ${msg.content}`);
      }
    }
  }
}


This code will output each SMS with its timestamp and content. Note how we iterate through msgGroup.message because a sender may have multiple messages (or multiple parts of one message). In a real agent, you might store the last-seen message ID or timestamp to avoid processing duplicates. Remember, the device can store only a limited number of messages (commonly 20) before it must delete or overwrite older ones
forum.peplink.com
. The API also provides a way to delete messages (POST /api/cmd.sms.delete), though deletion is beyond our current scope. If your use-case requires clearing messages, refer to Peplink’s documentation or forum for that endpoint
forum.peplink.com
forum.peplink.com
.

4. Sending SMS Messages

To send an SMS from the router’s SIM, use POST /api/cmd.sms.sendMessage. This command instructs the router’s cellular modem to send an SMS to a specified number
download.peplink.com
. The request must be JSON with at least the following fields:

address – The destination phone number in international format starting with “+”, followed by country code and number (2 to 15 digits, and the first digit after “+” cannot be 0)
download.peplink.com
. For example, "+14165550123" is a valid address, whereas "4165550123" (missing “+”) or "+04165550123" (invalid leading 0) would be rejected.

content – The message text to send. Standard SMS length rules apply (the router will handle sending as one or multiple SMS if over 160 chars, if supported). It’s marked optional in documentation
download.peplink.com
, but in practice you should provide a text string – an empty content would result in a blank SMS or an error.

connId – (Optional) The connection ID of the cellular WAN to use for sending
download.peplink.com
. If your router has only one cellular interface, you can omit this and the device will use the available modem. However, if multiple cellular connections exist, you should specify connId to ensure the SMS is sent via the intended modem/SIM, especially if different SIMs have different numbers or services. To avoid ambiguity, it’s best to include connId.

A successful send returns {"stat": "ok"} with no additional response content
download.peplink.com
. If there’s an error, you’ll get {"stat": "fail", "code": <int>, "message": "<error description>"} indicating what went wrong
download.peplink.com
.

Example – Sending an SMS (Node.js with Axios):

async function sendSms(connId, phoneNumber, text, auth) {
  const payload = { address: phoneNumber, content: text };
  if (connId) payload.connId = connId;
  const res = await axios.post(`${routerUrl}/api/cmd.sms.sendMessage`, payload, auth);
  if (res.data.stat === 'ok') {
    console.log(`SMS sent to ${phoneNumber} (via WAN ${connId || 'default'})`);
  } else {
    console.error(`Failed to send SMS: [Code ${res.data.code}] ${res.data.message}`);
  }
}

// Example usage:
sendSms(2, "+14165550123", "Test message from Peplink API", { headers: { Cookie: sessionCookie } });


In this snippet, auth could be an object containing the Cookie header or an accessToken param (similar to prior examples). We log success or failure accordingly.

Address Formatting: As noted, the API enforces that the phone number must include a “+” and country code
download.peplink.com
. If you attempt to send to a short code or a number without “+”, the router will respond with an error. For example, sending to "1111" will yield a failure:

{ "stat": "fail", "code": 400, "message": "Wrong address format" }


The router explicitly expects the “+” prefix in the address format
forum.peplink.com
. (As of current firmware, short code SMS without “+” are not supported, although this was raised as a feature request
forum.peplink.com
forum.peplink.com
.) Always format phone numbers in international format to avoid this error.

No SIM/Modem Errors: If you attempt to send an SMS when the specified connection has no active SIM or no cellular modem, the API will fail. For instance, on a device with no cellular module (or if the cellular WAN is disabled), you might get an error like {"stat":"fail","code":400,"message":"No modem present"} (or a similar “no SIM card” message). Ensure that the connId you use corresponds to an active cellular WAN with a SIM. You can verify this via the WAN status (the WAN should have a status like “Connected” or at least a SIM detected). If the SIM is missing or the modem is offline, handle the error by notifying the user or retrying on a different SIM if available.

5. Error Handling Strategies and Expected Responses

Robust error handling is crucial for an autonomous agent. The Peplink API uses a consistent response format, which makes it easier to parse success vs failure: every response JSON contains a top-level "stat" field that is "ok" for success or "fail" for an error
download.peplink.com
. In case of failure, a numeric "code" and a descriptive "message" are provided
download.peplink.com
. Here are some strategies and common cases to handle:

Always Check stat: After every API call, check if response.data.stat === "ok". Only then proceed to use the data in response.data.response. If stat is "fail", log or throw an error with the provided message. For example, a login failure might return stat:"fail", message:"Invalid credentials", or a token request failure might say "Invalid client credentials". Your agent should not proceed assuming success if stat is not ok.

Authentication Errors: If you get an error code that indicates not authorized (for example, code 401 or a message about authentication), your session may have expired or your token is invalid. In a session scenario, attempt to log in again to obtain a new cookie. In a token scenario, request a new token using the stored client credentials. Implement a retry mechanism for auth failures – but also be careful to avoid rapid loops (if credentials are wrong, repeated retries won’t help).

Parameter Errors: The API will return code 400 for bad requests such as missing or malformed parameters (as seen with the SMS address format example)
forum.peplink.com
. If you receive a "fail" with code 400, read the message to determine the issue. For instance:

“Wrong address format” – indicates the phone number did not meet format requirements
forum.peplink.com
. The solution is to fix the number format (include “+” and correct digits).

“Invalid connId” or no response – indicates you might have used a wrong WAN ID. Double-check the connId exists and corresponds to a cellular interface. Use /api/status.wan.connection to get the valid IDs if unsure.

“No SIM card” or “No modem present” – indicates the target WAN cannot send SMS (no SIM in slot, or no cellular modem at that ID). You may need to choose a different WAN or ensure a SIM is inserted/active.

Device-Specific Limits: Remember that the device can store only a finite number of SMS (commonly 20). If your agent polls for SMS but never deletes them, you could hit the storage limit. In such cases, new incoming messages might overwrite old ones or just not be stored. The API has no built-in push notification, so polling and managing storage is on you. Consider deleting messages after reading (the endpoint /api/cmd.sms.delete can delete by message ID
forum.peplink.com
) if you want to free space. Always handle the case where no new messages are present – the API will still return "stat":"ok" but the sms array might be empty.

HTTP Errors vs API Errors: Distinguish between network/HTTP errors and API-level errors. A non-200 HTTP status (e.g., connection timeout, DNS failure, etc.) means the request didn’t reach the API – handle these with retries and connectivity checks. If the HTTP request succeeds (HTTP 200) but stat is "fail", it’s an application-level issue as described above. Using Axios, you might set validateStatus to always true (as in the login example) so that you can handle API errors uniformly from the JSON response rather than exceptions.

Logging and Monitoring: For an autonomous agent, log all error responses (code and message) for visibility. Some error codes might correspond to specific conditions documented by Peplink (though the official docs don’t list all codes, they often align with HTTP concepts, e.g., 400 for bad request, 401 for unauthorized, etc.). Logging will help in diagnosing issues like expired tokens or connectivity problems.

6. Autonomous Operation Considerations

Building an AI-driven or autonomous integration with the router means your software should gracefully handle continuous operation, including maintaining connectivity and reacting to changes. Here are additional considerations:

Use HTTPS: Always use https:// to connect to the router’s API (the API listens on the same port as the Web UI). This ensures the credentials and tokens are not sent in plain text
forum.peplink.com
. You may need to handle self-signed certificates if the router uses one (Node.js can be configured to trust the router’s cert or you can disable strict SSL verification for local network access, but be cautious with security).

Polling Strategy for SMS: Since there is no push notification for new SMS, decide on a polling interval that balances timeliness with load. Polling the cmd.sms.get endpoint too frequently could be unnecessary load; polling too infrequently might delay action on an SMS. A reasonable approach might be to poll every few minutes, or use an exponential backoff if no new messages are coming. If the router supports SMS notifications via email or other channels, you might incorporate those, but assuming API-only here, polling is the way. Implement your agent to periodically call cmd.sms.get for each SIM. Keep track of message IDs you’ve seen to avoid duplicate processing (the id field can serve as a unique identifier for each SMS on that SIM).

Session/Token Keep-Alive: For session-based auth, note the session idle timeout – if your agent only polls every hour, the session cookie might expire due to inactivity. To keep a session alive, you could periodically call a lightweight endpoint (like a GET to /api/status.device.name or similar) more frequently than the timeout. However, using the token method is often easier: just renew the token every 48 hours and you don’t need to simulate activity
forum.peplink.com
. If using tokens, ensure your agent can handle the renewal without downtime (fetch a new token before the old one expires, then start using the new one).

Connection Timeouts and Retries: Set sensible timeouts on your HTTP requests (e.g., 5-10 seconds) so your agent doesn’t hang if the router is down or slow to respond. In Node.js Axios, you can use the timeout option. Implement a retry mechanism for transient failures – for example, if a request times out or the router is temporarily unreachable, wait a bit and retry. But also implement a limit or alert if the router remains unreachable for a prolonged period.

Concurrency: If reading and sending SMS in quick succession, be mindful that the router’s modem may not handle simultaneous SMS operations. It’s usually safe to fetch messages and send independently, but avoid flooding the router with back-to-back requests. If performing multiple actions (e.g. sending many SMS in a loop), consider a short delay between send requests to allow the modem to process them one by one.

Refreshing Data: For other info like which SIM is active, you might need to refresh the WAN status if the device can switch SIMs automatically (e.g., via health check or user action). The active SIM (simId) could change over time – your agent can periodically call /api/status.wan.connection to update its knowledge of which SIM is currently active on each WAN.

Thread Safety: If your Node.js agent is multi-threaded or uses worker threads (or multiple processes), ensure that they coordinate access to the router’s API to avoid race conditions (e.g., two threads trying to log in simultaneously could create multiple sessions or clients). It might be best to have one part of your agent responsible for maintaining authentication and provide a centralized function to make API calls (serializing them if necessary).

By following this guide, you can build a robust Node.js agent that logs into the Peplink Balance One’s local API, monitors which SIMs are active, reads incoming SMS messages (e.g., to trigger automation based on commands or alerts), and sends SMS notifications or replies as needed. This all operates entirely on the local device API with no reliance on InControl2 or external services, which is ideal for autonomous on-premises operation.
