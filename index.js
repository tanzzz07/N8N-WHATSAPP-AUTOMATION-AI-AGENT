const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

const app = express();
const processedMessages = new Set();

app.use(express.json({ limit: '200mb' }));

/*
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
*/

const DEFAULT_N8N_WEBHOOK =
    'http://localhost:5660/webhook-test/auto-reply';

const N8N_WEBHOOK =
    process.env.N8N_WEBHOOK || DEFAULT_N8N_WEBHOOK;

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function logSection(title) {

    console.log('\n==============================');
    console.log(title);
    console.log('==============================');

}

function serializeError(err) {

    if (!err) {
        return err;
    }

    return {
        message: err.message,
        name: err.name,
        stack: err.stack,
        code: err.code,
        status: err.response?.status,
        responseBody: err.response?.data
    };

}

function buildMessageDebugInfo(msg) {

    return {
        id: msg?.id?._serialized,
        from: msg?.from,
        to: msg?.to,
        body: msg?.body,
        type: msg?.type,
        fromMe: msg?.fromMe,
        author: msg?.author,
        timestamp: msg?.timestamp,
        hasMedia: msg?.hasMedia
    };

}

function logIncomingMessage(eventName, msg) {

    logSection('MESSAGE EVENT FIRED');
    console.log('EVENT:', eventName);
    console.log('MESSAGE DEBUG:', buildMessageDebugInfo(msg));
    console.log('MESSAGE RECEIVED');
    console.log('FROM:', msg?.from);
    console.log('BODY:', msg?.body);
    console.log('FROM ME:', msg?.fromMe);

}

async function sendToWebhook(payload) {

    logSection('WEBHOOK CALL');
    console.log('WEBHOOK URL:', N8N_WEBHOOK);
    console.log('REQUEST PAYLOAD:', payload);

    try {

        const response = await axios.post(
            N8N_WEBHOOK,
            payload,
            {
                timeout: 30000
            }
        );

        logSection('WEBHOOK RESPONSE');
        console.log('RESPONSE STATUS:', response.status);
        console.log('RESPONSE BODY:', response.data);

        return response;

    } catch (err) {

        logSection('WEBHOOK FAILURE');
        console.log('WEBHOOK URL:', N8N_WEBHOOK);
        console.log('REQUEST PAYLOAD:', payload);
        console.log('ERROR:', serializeError(err));

        throw err;

    }

}

async function processIncomingMessage(msg, eventName) {

    logIncomingMessage(eventName, msg);

    const messageId = msg?.id?._serialized;

    if (!messageId) {

        logSection('MESSAGE SKIPPED');
        console.log('Reason: Missing message ID');
        return;

    }

    if (processedMessages.has(messageId)) {

        console.log('Duplicate message skipped:', messageId);
        return;

    }

    processedMessages.add(messageId);

    try {

        if (msg.fromMe) {
            console.log('Processing self-message because existing logic allows it.');
        }

        const chat = await msg.getChat();
        const contact = await chat.getContact();

        console.log('CHAT INFO:', {
            id: chat?.id?._serialized,
            name: chat?.name,
            isGroup: chat?.isGroup
        });

        console.log('CONTACT INFO:', {
            id: contact?.id?._serialized,
            name: contact?.name,
            pushname: contact?.pushname,
            number: contact?.number
        });

        if (msg.from.includes('@g.us')) {

            console.log('Group message skipped:', msg.from);
            return;

        }

        const messages = await chat.fetchMessages({
            limit: 30
        });

        console.log('FETCHED MESSAGE COUNT:', messages.length);

        const history = messages
            .filter(m =>
                m.type === 'chat' &&
                m.body?.trim()
            )
            .map(m => ({
                fromMe: m.fromMe,
                body: m.body
            }));

        if (!history.length) {

            console.log('No valid messages found');
            return;

        }

        const payload = {
            type: 'auto_reply',
            chatId: msg.from,
            name:
                contact.pushname ||
                contact.name ||
                'Unknown',
            history
        };

        await sendToWebhook(payload);

        console.log('History sent to n8n');

    } catch (err) {

        logSection('MESSAGE PROCESSING ERROR');
        console.log('EVENT:', eventName);
        console.log('MESSAGE DEBUG:', buildMessageDebugInfo(msg));
        console.log('ERROR:', serializeError(err));

    }

}

function registerMessageListener(eventName) {

    console.log(`Registering WhatsApp listener: ${eventName}`);

    client.on(eventName, async (msg) => {

        await processIncomingMessage(msg, eventName);

    });

}

/*
|--------------------------------------------------------------------------
| GLOBAL ERROR HANDLING
|--------------------------------------------------------------------------
*/

process.on('unhandledRejection', (err) => {

    logSection('UNHANDLED REJECTION');
    console.log(serializeError(err));

});

process.on('uncaughtException', (err) => {

    logSection('UNCAUGHT EXCEPTION');
    console.log(serializeError(err));

});

/*
|--------------------------------------------------------------------------
| WHATSAPP CLIENT
|--------------------------------------------------------------------------
*/

logSection('INITIALIZING WHATSAPP CLIENT');
console.log('N8N_WEBHOOK CONFIGURED AS:', N8N_WEBHOOK);

if (N8N_WEBHOOK === DEFAULT_N8N_WEBHOOK) {
    console.log(
        'Using default N8N_WEBHOOK. If n8n is running in Docker, localhost may need to be replaced with the correct host.'
    );
}

const client = new Client({

    authStrategy: new LocalAuth({
        clientId: 'main'
    }),

    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,

    restartOnAuthFail: true

});

/*
|--------------------------------------------------------------------------
| DEBUG EVENTS
|--------------------------------------------------------------------------
*/

client.on('change_state', (state) => {

    logSection('STATE CHANGED');
    console.log(state);

});

client.on('loading_screen', (percent, message) => {

    logSection('LOADING');
    console.log(percent + '%');
    console.log(message);

});

client.on('message_ciphertext', (msg) => {

    logSection('MESSAGE CIPHERTEXT');
    console.log(buildMessageDebugInfo(msg));

});

client.on('message_ciphertext_failed', (msg) => {

    logSection('MESSAGE CIPHERTEXT FAILED');
    console.log(buildMessageDebugInfo(msg));

});

/*
|--------------------------------------------------------------------------
| QR
|--------------------------------------------------------------------------
*/

client.on('qr', (qr) => {

    logSection('SCAN QR CODE');

    qrcode.generate(qr, {
        small: true
    });

});

/*
|--------------------------------------------------------------------------
| AUTH EVENTS
|--------------------------------------------------------------------------
*/

client.on('authenticated', () => {

    logSection('AUTHENTICATED');

});

client.on('auth_failure', async (msg) => {

    logSection('AUTH FAILURE');
    console.log(msg);

});

/*
|--------------------------------------------------------------------------
| READY
|--------------------------------------------------------------------------
*/

client.on('ready', async () => {

    logSection('WHATSAPP READY');

    try {

        const state = await client.getState();
        const wwebVersion = await client.getWWebVersion();

        console.log('STATE:', state);
        console.log('WWEB VERSION:', wwebVersion);
        console.log('\nCLIENT INFO:\n');
        console.log(client.info);

        if (client.pupPage) {
            client.pupPage.on('pageerror', (err) => {
                logSection('PUPPETEER PAGE ERROR');
                console.log(err.toString());
            });

            client.pupPage.on('error', (err) => {
                logSection('PUPPETEER ERROR');
                console.log(err.toString());
            });
        }

    } catch (err) {

        console.log(serializeError(err));

    }

});

/*
|--------------------------------------------------------------------------
| DISCONNECTED
|--------------------------------------------------------------------------
*/

client.on('disconnected', async (reason) => {

    logSection('DISCONNECTED');
    console.log(reason);
    console.log(
        '\nConnection lost. Manual restart recommended.'
    );

});

/*
|--------------------------------------------------------------------------
| MESSAGE LISTENER
|--------------------------------------------------------------------------
|
| IMPORTANT:
| ONLY COMMANDS WILL EXECUTE
|
| TEXT COMMAND:
| /naman ko bol sham ko meet hai
|
| VOICE COMMAND:
| send voice note starting with:
| "command ..."
|
*/

registerMessageListener('message');
registerMessageListener('message_create');

/*
|--------------------------------------------------------------------------
| SEND MESSAGE API
|--------------------------------------------------------------------------
*/

app.post('/send-message', async (req, res) => {

    try {

        logSection('SEND MESSAGE API');
        console.log(req.body);

        const {
            chatId,
            message
        } = req.body;

        if (!chatId || !message) {

            return res.status(400).json({
                success: false,
                error: 'chatId and message required'
            });

        }

        const state = await client.getState();

        console.log('\nCURRENT STATE:', state);

        await client.sendMessage(
            chatId,
            message
        );

        console.log('\nMESSAGE SENT SUCCESSFULLY');

        res.json({
            success: true
        });

    } catch (err) {

        logSection('SEND MESSAGE ERROR');
        console.log(serializeError(err));

        res.status(500).json({
            success: false,
            error: err.message
        });

    }

});

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get('/', async (req, res) => {

    try {

        let state = 'UNKNOWN';

        try {

            state = await client.getState();

        } catch (err) {

            console.log('Health check could not fetch client state:', err.message);

        }

        res.json({
            success: true,
            state
        });

    } catch (err) {

        res.json({
            success: false,
            error: err.message
        });

    }

});

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(3000, () => {

    logSection('EXPRESS SERVER STARTED');
    console.log('PORT: 3000');

});

/*
|--------------------------------------------------------------------------
| START CLIENT
|--------------------------------------------------------------------------
*/

logSection('STARTING WHATSAPP CLIENT');

client.initialize()
    .then(() => {
        console.log('client.initialize() resolved');
    })
    .catch((err) => {
        logSection('CLIENT INITIALIZATION FAILED');
        console.log(serializeError(err));
    });

    client.on('message_create', async (msg) => {
    console.log('MESSAGE_CREATE EVENT');
    console.log(msg.body);
});