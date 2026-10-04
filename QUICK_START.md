# Job Trail — Quick Start

## 1. Keep your existing `server/.env`
Do NOT upload or commit it. The fixed package intentionally excludes `.env`.

Minimum required values:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_PROVIDER=openai`
- `OPENAI_API_KEY`
- `OPENAI_MODEL=gpt-4o-mini`

## 2. Start the backend

Open PowerShell in the `server` folder:

```powershell
npm install
npm start
```

You should see the server start on:

`http://localhost:4000`

## 3. Open Job Trail

Use:

`http://localhost:4000`

Do not open `job-trail.html` by double-clicking it. The backend serves the frontend and keeps the API connection simple.

## 4. Test the real features

1. Sign up / log in.
2. Open **Resume analyzer**.
3. Upload a text-based PDF or DOCX (max 5 MB).
4. Paste a real job description.
5. Click **Save & analyze job**.
6. Click **Analyze ATS match**.
7. Click **Tailor resume with AI**.
8. Open **AI assistant** and send a message.

## What was fixed

- AI assistant initialization no longer depends on dashboard/application requests succeeding.
- Logout now clears tokens, active resume/JD IDs, conversation state, and chat UI.
- Uploading a new resume or saving a new JD resets stale chat context.
- Development CORS accepts common local frontend ports (4000/5173/5500).
- Backend still keeps the OpenAI key server-side; it is never placed in the HTML.
