# KCNA Academy — Nutanix team

A complete, dependency-free Node.js learning application, prepared for Vercel.

## Contents

- 21 lessons mapped to the current four-domain syllabus: 44% Fundamentals, 28% Orchestration, 16% Application Delivery and 12% Architecture.
- 150 original questions; three disjoint 50-question, 75-minute mock papers with exactly 22/14/8/6 questions per domain.
- An additional 60-question, 90-minute mixed simulation sampled from the same bank (26/17/10/7), ten-question diagnostic and targeted practice.
- Answer explanations, flags, saved timers, automatic expiry submission, score history and 63 revision cards.
- Four linked YouTube tutorials and four clearly labelled topic searches, plus official reading references.
- Car Mode: spoken lessons, quick recaps and 150 audio practice questions with adjustable thinking time, voice/speed selection, auto-next, sleep timer and optional screen wake lock.
- Four-week team study plan, exam-day checklist, local notes, progress backups and manual team-report import.

## Run locally

Use Node.js 22 or newer. No runtime packages are required.

```sh
TEAM_PASSWORD=choose-a-local-password npm start
```

Open http://localhost:3000 and sign in with the password you configured. Passwords are case-sensitive.

```sh
npm test
TEAM_PASSWORD=choose-a-local-password npm run build
```

## Deploy to Vercel

Import this GitHub repository into Vercel as a new project:

1. Select your team and use `nutanix-kcna-academy` as the project name.
2. Keep the repository root as the root directory.
3. Use framework preset **Other**. The checked-in `vercel.json` supplies the build command (`npm run build`) and output directory (`.vercel/output`).
4. Add a sensitive environment variable named `TEAM_PASSWORD` with your chosen shared password. Enable it for Production (and Preview if you use preview deployments).
5. Deploy, then open the production URL and sign in with that password.

The build produces one protected Node.js function, with no public source or content files. Signing credentials are generated during the build and never committed.

Authentication is enforced by the server before returning the app, JavaScript, questions or videos. The password is stored as a salted scrypt hash. Sessions use an HMAC-signed, expiring, HttpOnly, SameSite=Strict cookie, with Secure on Vercel. The repository contains no generated session secrets. The build generates a fresh random salt and signing secret inside the server-only function and hashes the password from the required `TEAM_PASSWORD` environment variable. Rebuilding invalidates prior sessions. Set `TEAM_PASSWORD` during build. Advanced deployments may override `PASSWORD_SALT`, `PASSWORD_HASH` and `SESSION_SECRET` at runtime. Keep all generated secret files excluded from source control. For local development, `npm start` initializes the ignored local credentials file automatically. Tests use independent ephemeral credentials.

Public production access should reach the application's team-password screen without requiring individual Vercel logins. Verify the project's production deployment protection setting accordingly; do not remove this application's authentication.

## Progress and privacy

Learner progress is localStorage-based, per browser profile. It does not sync to a server or between teammates. Export/import moves backups; team report import builds a local comparison table. Reports are self-reported and not identity-verified. Practice answers are available to authenticated learners for review, so this is an informal study tool, not a secure assessment system. Rate limiting is best-effort per serverless instance; a distributed limiter can be added if needed.

## Car Mode

Open **Car Mode** from the academy navigation, or visit `/car` after signing in. Configure the playlist while parked and tap Play. Bluetooth routing uses your phone’s normal audio output; this is a browser player, not an Android Auto or CarPlay app.

Uses the browser Web Speech API and available English device voices. Voice availability and background/locked-screen playback vary by device and browser. Keep the page open; the optional screen wake lock works only where supported and while the page is visible. Some voices require a network connection. No microphone, paid speech API or extra environment variables are required. Audio is synthesized on demand; no downloadable audio files are generated.

Pause/resume repeats the current sentence. Audio questions read four options, wait 8/15/25 seconds, then explain the correct answer; they do not record or score responses. The sleep timer counts wall-clock time from Play, including pauses, and resets after it expires or the playlist changes. Auto-next stops at the end of the playlist. Your place, preferences and listening history are saved under `kcna-car-mode-v1` in this browser and are separate from academy progress and its export/import backups. Reloading restores your place without starting playback.

Car routes and scripts use the same server-side authentication as the academy. No extra deployment setup is needed beyond the existing `TEAM_PASSWORD` environment variable.

## Validation performed

- Node integration checks cover: curriculum distribution, protected routes, valid/invalid login, forged/expired sessions, cross-origin rejection and logout.
- Client logic tests passed: page rendering functions, scoring, 74% fail boundary, unanswered marking, simulation expiry, targeted practice, persistence and import validation/recalculation.
- Audio engine tests cover full-bank narration, correct-answer order, thinking pauses, stale callbacks, resume, voice errors and completion. A browser timer receiver regression check covers initial player setup, question gaps, pause/resume and track changes. Protected audio routes and Vercel packaging are checked. Real device speech, Bluetooth and screen-lock behavior require a phone check after deployment.
- Source JavaScript syntax and Vercel function packaging checked.
- Live browser layout/interaction and production deployment verification remain pending: the cloud browser cannot reach the local server, and Vercel requires sign-in before publishing.

## Sources checked 21 September 2026

- https://training.linuxfoundation.org/certification/kubernetes-cloud-native-associate/
- https://docs.linuxfoundation.org/tc-docs/certification/faq-mc
- https://github.com/cncf/curriculum/blob/master/KCNA_Curriculum.pdf
- Official Kubernetes, CNCF, OpenGitOps and OpenTelemetry references linked with each lesson.

The real exam is currently listed as a 90-minute proctored multiple-choice exam with a 75% pass mark. The mocks are our own practice formats. Suggested 85% study readiness is guidance, not a prediction or certification guarantee. This academy is not affiliated with or endorsed by CNCF or the Linux Foundation.
