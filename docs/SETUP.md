# GetVari — Local Setup

Three separate pieces live in this repo:

| Piece | Location | Purpose |
| --- | --- | --- |
| React Native app | `GetVariApp/` | The mobile app (Android + iOS) |
| Python chatbot backend | `GetVariApp/Chatbot/backend/` | FastAPI + LangGraph, serves Vari (the in-app assistant) and `GET /config` on port 8000 |
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

Serves on `http://0.0.0.0:8000`. Check it with `curl http://localhost:8000/ping`, and the app's
runtime configuration with `curl http://localhost:8000/config`.

### One-time database setup

Run these in the Supabase SQL editor, in order. Both are idempotent.

| File | Creates |
| --- | --- |
| `getvari_schema.sql` | Profiles and hydration log tables |
| `setup_db.sql` | pgvector, the `documents` table and `match_documents` |
| `app_config_schema.sql` | `getvari_app_config` — the single row the admin console edits |

Until `app_config_schema.sql` is run, `GET /config` falls back to
`default_app_config.json` and the app behaves exactly as it did before, so this
is safe to do at any point.

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

or point the build at an address explicitly in `GetVariApp/app.json` — this is also how a release
build is told where the deployed backend is, since it has no Metro URL to derive one from:

```json
{ "aquaSageBackendUrl": "http://192.168.1.42:8000" }
```

(`ipconfig` on Windows, under IPv4 Address.) A configured URL is used as-is and never probed.

Metro logs each attempt as `[Backend] Probing ... failed`, which tells you which addresses were tried.

## App configuration (no more hardcoded diseases)

Disease definitions and everything derived from them — how far each diagnosis moves the daily
goal, how it re-weights the risk engine, its PBWR ceiling, whether the app refuses to pace
intake without a physician's limit — plus the activity bands, work environments, climate bands,
goal formula and quick-log amounts, all live in **one Supabase row**, edited from the admin
console's **App Config** tab.

- The app fetches it from `GET /config` on launch and on every foreground, and caches the last
  good document so a cold start is never built on stale defaults.
- `Chatbot/backend/default_app_config.json` is the shipped fallback. It is imported by *both*
  the backend and `src/config/appConfigSchema.ts`, so the server's default and the app's default
  are the same bytes rather than two lists to keep in step.
- Reads go through `src/config/appConfigStore.ts`, which imports nothing native and is therefore
  safe for the pure-logic modules (`hydrationTarget`, `hydrationRiskEngine`, `hydrationModel`,
  `PBWRService`). `src/services/ConfigService.ts` owns fetching and caching.

**Condition ids are the join to stored profiles.** Retire an id, never rename one — a profile
that stored `ckd` keeps storing it.

## Keeping the deployed backend awake

The Render free plan stops the service after 15 minutes without traffic, and starting it again
takes 30-50 seconds — which a user experiences as the assistant taking most of a minute to
answer. Three things mitigate it:

- `.github/workflows/keep-backend-awake.yml` pings `/ping` every 10 minutes.
- The app calls `warmBackend()` at launch and on every foreground, so the wake-up is paid for on
  a screen the user is reading rather than on a message they are waiting for.
- The chat explains a wait longer than four seconds instead of showing a bare spinner.

The real fix is a paid instance that does not sleep; delete the workflow when the service moves
off the free plan.

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

## Building a release APK

```bash
cd GetVariApp
npx react-native build-android --mode=release   # or: cd android && ./gradlew assembleRelease
```

The APK lands at `android/app/build/outputs/apk/release/app-release.apk`.

### Redeploy the backend first

Two of the app's behaviours are split across the app and the server, and a release
APK built against an out-of-date deployment silently loses both:

| If the backend is stale | What the user sees |
| --- | --- |
| `GET /config` missing | The app falls back to `default_app_config.json`. Everything works, but the **App Config** admin tab has no effect on installed apps. |
| Chat fast paths missing | "Who are you?" still costs a rephrase + embedding + vector search + rerank + generate — the ~45-second answer. |

Check before you ship:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://getvari-aquasage.onrender.com/ping
curl -s -H "X-API-Key: $KEY" https://getvari-aquasage.onrender.com/config | head -c 120
```

`/config` returning `{"detail":"Not Found"}` means the deployment predates this work.

### Signing

`android/app/build.gradle` signs **release with the debug keystore**. That is fine for
an APK people sideload, and it is not fine for Play: the debug key is shared by every
RN project, and an app signed with it can never be updated by one signed with a real
key. Generate a keystore and point `signingConfigs.release` at it before any public
release.

### Verifying a build actually contains your changes

Hermes compiles the JS to bytecode, so `grep` on the bundle needs both encodings —
ASCII strings are packed one byte per character, anything containing `…`, `—`, `·` or
an emoji is stored as UTF-16:

```bash
unzip -p app-release.apk assets/index.android.bundle > /tmp/bundle
python3 - <<'PY'
raw = open('/tmp/bundle','rb').read()
def present(s):
    return s.encode('ascii','ignore') in raw or s.encode('utf-16-le') in raw
for probe in ['PhoneNumberModule', 'Loading your hydration data', 'refreshes hourly']:
    print(('ok  ' if present(probe) else 'MISS'), probe)
PY
```

A miss on the ASCII form alone is usually an encoding artefact, not a missing change.

### Minification

`enableProguardInReleaseBuilds` is `false`. If you turn it on, the keep rules in
`android/app/proguard-rules.pro` matter: a stripped native module does not crash, it
just makes `NativeModules.PhoneNumberModule` undefined, which the app reads as "this
device can't offer the SIM picker" and silently falls back to the manual field.
