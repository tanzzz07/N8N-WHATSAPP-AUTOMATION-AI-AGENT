# N8N WhatsApp Automation AI Agent

A Node.js WhatsApp automation service that connects `whatsapp-web.js` with an `n8n` webhook pipeline.

The application listens for incoming WhatsApp messages, builds recent chat history, and forwards that history to an `n8n` webhook so downstream workflows can generate replies, trigger automations, or coordinate AI agents. It also exposes a lightweight Express API for outbound message delivery.

## Highlights

- WhatsApp Web integration via `whatsapp-web.js`
- Express server for health checks and outbound sends
- Axios-based webhook delivery to `n8n`
- Local session persistence with `LocalAuth`
- Incoming message debug tracing for webhook troubleshooting
- Support for both `message` and `message_create` listeners for better runtime compatibility

## Architecture

```text
WhatsApp -> whatsapp-web.js client -> message handler -> webhook payload -> n8n
                                              |
                                              -> Express API (/send-message, /)
```

## Tech Stack

- Node.js
- Express
- Axios
- whatsapp-web.js
- qrcode-terminal

## Project Structure

```text
.
├── index.js
├── package.json
├── package-lock.json
└── README.md
```

## How It Works

When a message arrives:

1. The WhatsApp client emits an event.
2. The app logs the raw incoming message before filtering.
3. Duplicate message IDs are ignored.
4. Group chats are skipped.
5. Recent chat history is fetched from the current conversation.
6. A webhook payload is sent to `n8n` in the existing format:

```json
{
  "type": "auto_reply",
  "chatId": "1234567890@c.us",
  "name": "Contact Name",
  "history": [
    {
      "fromMe": false,
      "body": "Hello"
    }
  ]
}
```

The webhook payload format is intentionally preserved so existing `n8n` workflows continue to work without modification.

## API Endpoints

### `GET /`

Basic health check for the Express app and WhatsApp client state.

Example response:

```json
{
  "success": true,
  "state": "CONNECTED"
}
```

### `POST /send-message`

Sends an outbound WhatsApp message through the connected client.

Request body:

```json
{
  "chatId": "1234567890@c.us",
  "message": "Hello from the automation service"
}
```

Response:

```json
{
  "success": true
}
```

## Configuration

The service supports the following runtime configuration:

### `N8N_WEBHOOK`

Webhook target for the `n8n` flow.

If not provided, the app defaults to:

```text
http://localhost:5660/webhook-test/auto-reply
```

PowerShell example:

```powershell
$env:N8N_WEBHOOK="http://localhost:5660/webhook-test/auto-reply"
node index.js
```

## Installation

```bash
npm install
```

## Run the App

```bash
node index.js
```

On first run, the app will print a QR code in the terminal. Scan it with the WhatsApp account you want to connect.

## Debug Logging

The app includes temporary high-visibility logs for:

- client initialization
- listener registration
- incoming message events
- webhook URL and payload
- webhook responses
- webhook failures
- Puppeteer page errors
- WhatsApp connection state changes

These logs are especially useful when messages are arriving in WhatsApp but are not reaching `n8n`.

## Troubleshooting

### Messages arrive in WhatsApp but no `"MESSAGE RECEIVED"` log appears

Check:

- the QR session is authenticated
- the client reaches the `ready` event
- `message` or `message_create` listeners are registered
- Puppeteer page errors are not breaking the runtime

### Webhook logs appear but `n8n` does not receive the request

Check:

- the `N8N_WEBHOOK` value
- whether `n8n` is actually listening on port `5660`
- whether `localhost` is valid for your deployment topology

If either service runs in Docker, `localhost` may point to the wrong container. In that case, use the appropriate host or container network address.

### Group chats are not forwarded

This is expected behavior in the current logic. Group messages are intentionally skipped.

## Notes

- Existing business logic and webhook payload structure are preserved.
- The current implementation keeps self-message processing behavior intact.
- `LocalAuth` stores session data locally for persistent login.

## License

ISC
