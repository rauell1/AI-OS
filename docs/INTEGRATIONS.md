# Rauell OS integrations

## Google Workspace setup

The application implements OAuth, encrypted token storage, token refresh and data synchronization for Gmail, Google Calendar and Google Drive.

1. Create a Google Cloud project and enable the Gmail API, Google Calendar API and Google Drive API.
2. Configure the OAuth consent screen as **External** and add the owner address (`src/lib/auth-policy.ts`) as a test user.
3. Create an OAuth client with application type **Web application**.
4. Add this exact local redirect URI:

   `http://localhost:3000/api/integrations/google/callback`

   Add this exact production redirect URI too:

   `https://ai-os.rauell.systems/api/integrations/google/callback`
5. Add the client values to `.env.local`:

   ```env
   APP_URL="https://ai-os.rauell.systems"
   GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="..."
   GOOGLE_REDIRECT_URI="https://ai-os.rauell.systems/api/integrations/google/callback"
   ```

6. Restart the app, open `/integrations`, and connect Gmail, Calendar and Drive separately. Separate consent keeps access incremental and permission-scoped.
7. Use **Sync** on each card, or create an `integration sync` automation on `/automations`.

Imported data appears in Inbox, the daily brief/calendar context, Documents, Activity and automation notifications.

## AI providers

Add one or more provider keys to `.env.local`. Settings only enables providers that have a key. The selected provider is used by assistant chat and AI-backed automations; if it is unavailable, the backend falls back to another configured provider and finally to deterministic behavior.

NVIDIA NIM is currently configured in this workspace. OpenAI, Anthropic and Gemini remain optional.

## WhatsApp automation architecture

Use the official Meta WhatsApp Cloud API, not browser automation. A production implementation needs:

- a Meta Business portfolio, developer app and WhatsApp Business Account;
- a registered business phone number and permanent system-user access token;
- a public HTTPS webhook route for inbound messages and delivery-status events;
- webhook signature verification and a verify-token challenge;
- opt-in/consent records, contact identity mapping and encrypted credentials;
- approved message templates for business-initiated conversations outside the customer-service window;
- an approval queue before AI-generated outbound messages are sent;
- idempotency, retries, rate-limit handling, audit logs and data-retention controls.

Recommended Rauell OS flow:

`WhatsApp webhook -> contact/thread store -> classification and task extraction -> approval -> Cloud API send -> delivery tracking`

Environment variables should be kept server-side:

```env
WHATSAPP_ACCESS_TOKEN=""
WHATSAPP_PHONE_NUMBER_ID=""
WHATSAPP_BUSINESS_ACCOUNT_ID=""
WHATSAPP_VERIFY_TOKEN=""
WHATSAPP_APP_SECRET=""
```
