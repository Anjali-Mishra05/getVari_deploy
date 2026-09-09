# getVāri

An AI-assisted hydration app. It reads heart rate, movement, ambient
temperature and humidity, combines them with the user's profile and the time
since their last drink, and produces a dehydration risk score with a
recommendation attached. A chat assistant answers hydration questions and logs
intake conversationally.

Android (React Native) · FastAPI + LangGraph backend · Supabase · React admin
console.

---

## Repository layout

| Path | What it is |
| --- | --- |
| `GetVariApp/` | The React Native app — the product |
| `GetVariApp/src/admin-web/` | Admin console (React + Vite), shares types with the app |
| `GetVariApp/Chatbot/backend/` | FastAPI + LangGraph chat service and the `/config` endpoint |
| `GetVariApp/android/` · `ios/` | Native projects, including two custom modules |
| `docs/` | Setup guide, engine notes, and the reference documents behind the algorithm |
| `render.yaml` | Render blueprint for the chat backend |
| `src/`, `server.ts` (root) | Earlier web prototype and a Firebase/JWT auth server. Not part of the mobile product; kept because the prototype is still the reference for several dashboard visuals. |

## Quick start

Requires **Node ≥ 22.11**, **Python 3.12** (not 3.13 — several pinned wheels
have no 3.13 build), **JDK 17**, and the Android SDK.

```bash
# Chat backend
cd GetVariApp/Chatbot/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt && python main.py     # :8000

# App
cd GetVariApp
npm install
npm start                                             # Metro, leave running
npm run android                                       # second terminal
```

Secrets are not committed. `.env.example` in each package lists the required
keys. Full instructions, including the one-time Supabase setup, are in
[docs/SETUP.md](docs/SETUP.md).

## How it works

**Risk scoring.** Five sensor and environmental readings are mapped to 0–100
load bands, weighted, and combined. The weights and the load multipliers are
adjusted per user — body mass, diagnoses, and the climate of their resolved
city. The method, including worked examples, is
[docs/reference/hydration-risk-algorithm.pdf](docs/reference/hydration-risk-algorithm.pdf);
`GetVariApp/__tests__/algoSpecCompliance.test.ts` checks the implementation
against it, asserting the published intermediate weights rather than only the
final score.

**Runtime configuration.** Disease definitions and everything derived from them
— goal adjustments, risk weights, PBWR ceilings, which diagnoses require a
physician's daily limit — plus activity bands, work environments, climate bands
and the goal formula all live in a single Supabase row, edited from the admin
console's **App Config** tab and served by `GET /config`. Nothing about them is
compiled into the app.

Changes reach installed apps on their next foreground. `default_app_config.json`
is the shipped fallback and is imported by both the backend and the app, so the
two cannot disagree. A published document is merged field by field over that
fallback, so a deployment older than an installed app cannot strip fields it
has never heard of.

**Condition ids are the join to stored profiles.** Retire an id; never rename
one — a profile that stored `ckd` keeps storing it.

## Tests

```bash
cd GetVariApp
npm run test:hydration    # 381 tests: engine, config, scheduling, parsing
npm test                  # component tests
```

The logic suites run in plain Node with every native module mocked, so they
stay fast. The pure-logic modules deliberately import `src/config/appConfigStore`
rather than `ConfigService`, which keeps AsyncStorage and the RN bridge out of
that graph.

## Building a release

```bash
cd GetVariApp/android && ./gradlew assembleRelease
# -> app/build/outputs/apk/release/app-release.apk
```

Two things to know before distributing one:

- **Redeploy the backend first.** An APK built against a stale deployment loses
  the admin-driven configuration and the chat's fast paths, silently.
- **Release currently signs with the debug keystore.** Fine for sideloading;
  unusable for Play, and an app signed with it can never be updated by one
  signed with a real key.

The APK is arm64-only (`reactNativeArchitectures` in `android/gradle.properties`)
and targets Android 7.0+. Verification steps — including how to grep a Hermes
bundle, which stores non-ASCII strings as UTF-16 — are in
[docs/SETUP.md](docs/SETUP.md).

## Documentation

| | |
| --- | --- |
| [docs/SETUP.md](docs/SETUP.md) | Local setup, database, release builds, deployment |
| [docs/recovery-engine.md](docs/recovery-engine.md) | Absorption and recovery model |
| [docs/reference/](docs/reference/) | Algorithm specification, QA reports, defect sheet |
