# Test status

On 28 October 2026, the existing project was checked locally on Windows:

- Backend: `cd backend; .venv\Scripts\python.exe -m pytest -o addopts='' -q` — 350 passed, 13 skipped. The skipped tests require the live AI service.
- Frontend after Lite: `cd frontend; npm.cmd test` — 53 files, 585 tests passed.
- Translations: `npm.cmd run check:i18n` — 3,981 matching keys in Vietnamese and English.
- Production build: `npm.cmd run build` — passed.
- Live AI: `cd backend; $env:RUN_LIVE_AI='1'; .venv\Scripts\python.exe -m pytest -o addopts='' -m live -v` — 13 passed, 350 deselected in 426.12 seconds. These are the existing live tests, not exhaustive coverage of all endpoints or language combinations.

Lite was also exercised in Chromium against a mocked API: saving, a full offline reload including a marked image, quiz ordering, a user-selected feedback rating and deletion of the saved copy. The offline reload was checked in Vietnamese at 375 px and English at 1366 px. A separate smoke check against the real backend with an isolated demo database opened `/lite/TPEND6` at 375 px, loaded five images, submitted a quiz (HTTP 201, 5/5), then reloaded the saved lesson and images offline. The Lite tutor and voice input were not independently tested against the live API.

These checks are not a full accessibility, security, visual or live-model acceptance test. The previous Claude transcript reports an 18-step real-model flow, but that flow was not independently rerun in this check.

On Windows, use `npm.cmd` if PowerShell's execution policy blocks `npm.ps1`. Live tests are opt-in: set `RUN_LIVE_AI=1` and run `python -m pytest -m live -v` with a configured Meta API key. Live calls can incur charges and send test materials to the model provider.
