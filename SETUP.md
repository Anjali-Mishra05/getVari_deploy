# GetVari — Local Setup

Three separate pieces live in this repo:

| Piece | Location | Purpose |
| --- | --- | --- |
| React Native app | `GetVariApp/` | The mobile app (Android + iOS) |
| Python chatbot backend | `GetVariApp/Chatbot/backend/` | FastAPI + LangGraph, serves AquaSage on port 8000 |
| Express server | `server.ts` (repo root) | Firebase auth / JWT exchange |

On Windows you can run all three; only the iOS build is unavailable.

## Prerequisites

- **Node.js 22.11.0 or newer** (`GetVariApp/package.json` enforces this)
- **Python 3.12** — *not* 3.13 or newer. Several pinned wheels have no 3.13 build and will try to compile from source, which fails on Windows without MSVC build tools.
- **JDK 17** and **Android Studio** with the Android SDK
- A physical Android device or an emulator

## Secrets

Secret files are deliberately not committed. Get these from Sereena and place them yourself:

- `.env` at the repo root — for `server.ts`
- `GetVariApp/.env` — for the app
- `GetVariApp/Chatbot/backend/.env` — for the Python backend
- `service-account.json` at the repo root — Firebase admin credentials

`.env.example` at the repo root and in `GetVariApp/` list the required keys. The backend needs `SUPABASE_SERVICE_ROLE_KEY`, `JINA_API_KEY`, and `GROQ_API_KEY`.

`GetVariApp/android/app/google-services.json` **is** committed, so Firebase on Android works with no extra setup.

## 1. Python backend

```bash
cd GetVariApp/Chatbot/backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
python main.py
```

Serves on `http://0.0.0.0:8000`. Check it with `curl http://localhost:8000/ping`.

## 2. React Native app

```bash
cd GetVariApp
npm install
npm start                     # Metro, leave running
npm run android               # in a second terminal
```

Android Studio writes `android/local.properties` with your SDK path on first open. It's gitignored, so it stays machine-specific — don't commit it.

### Connecting the app to the backend

The app auto-discovers the backend at launch (`src/config/backend.ts`). It derives your machine's address from the Metro bundler URL, so a physical device on the same Wi-Fi generally just works, as does the emulator via `10.0.2.2`.

If discovery fails, either forward the port:

```bash
adb reverse tcp:8000 tcp:8000
```

or set `MANUAL_OVERRIDE` in `src/config/backend.ts` to your machine's LAN address (`ipconfig` on Windows, under IPv4 Address):

```ts
const MANUAL_OVERRIDE: string | null = 'http://192.168.1.42:8000';
```

Metro logs each attempt as `[AquaSage] No backend at ...`, which tells you which addresses were tried.

## 3. Express server (optional)

Only needed for the Firebase auth / JWT flow. From the repo root:

```bash
npm install
npm run dev
```

## Tests

```bash
cd GetVariApp
npm test                      # full suite
npm run test:hydration        # hydration logic only
```

## Notes

- Don't commit `android/.gradle_home/` — it's Gradle's dependency cache, roughly 1 GB, and GitHub rejects files over 100 MB. It's gitignored.
- `npm install` in `GetVariApp/` and at the repo root are separate; both are needed if you're running the Express server too.
