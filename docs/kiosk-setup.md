# Kiosk setup: the office PC and the 55" panel

The main office Windows PC drives the ViewSonic IFP55G1 over HDMI (video) and USB (touch) and runs the board service (decision 19). The panel has no OS of its own in this setup; it is a 3840×2160 touch monitor.

## 1. Folder and secrets

```
C:\SealTech\board\            ← git clone of this repo (branch main after merge)
C:\SealTech\board\.env        ← the ONLY place secrets live; copy from .env.example
C:\SealTech\board\data\       ← board.db, snapshot.json, roster.json, jobber-token.json (created by the service)
C:\SealTech\board\logs\       ← service stdout/stderr (NSSM rotates)
```

`.env` is in `.gitignore`. Never paste its contents anywhere. The Google service-account key file sits next to it and is named in `GOOGLE_SA_KEY_PATH`.

## 2. Install

1. Install Node 22 LTS (x64) and Git for Windows.
2. Install NSSM (`winget install nssm`).
3. In PowerShell as administrator:
   ```powershell
   cd C:\SealTech\board
   npm ci
   npm run build
   npm run fixtures
   .\apps\service\windows\install-service.ps1
   ```
   The script registers the `SealTechBoard` service (automatic start, restart on crash, logs in `logs\`).
4. Browse to `http://localhost:8787/` on the PC. The board should show the TESTVILLE fixtures (`BOARD_DATA_SOURCE=fixtures` in `.env`). Switch to `live` only after the Jobber developer app exists (`jobber-app-handoff.md`).

## 3. Chrome kiosk at device scale 2

The board is designed on a 1920×1080 CSS grid; the panel is 3840×2160. Chrome must run with `--force-device-scale-factor=2`, or every zone renders at half size and the footer shows a red `DPR` badge.

1. Import `apps\service\windows\kiosk-task.xml` in Task Scheduler (Action → Import Task). It runs at logon of the office user and launches:
   ```
   chrome.exe --kiosk --force-device-scale-factor=2 --disable-session-crashed-bubble --noerrdialogs --disable-features=TranslateUI --app=http://localhost:8787/?kiosk=1
   ```
2. Windows display settings: the panel as the second display, 3840×2160, scale 100 % (Chrome does the scaling, not Windows), "Extend" mode. Put the kiosk window on the panel (Win+Shift+Arrow once; Chrome remembers).
3. Power: never sleep when plugged in; display off never; the panel's own power schedule turns the backlight off at 19:00 and on at 06:30.
4. Touch: Windows → Tablet PC Settings → Setup → tap the panel so touch maps to the right display.
5. The panel's picture settings: picture mode PC or Game, overscan off ("Just Scan" / "Screen Fit"), sharpness 0. Overscan crops 48–96 px off the sides, which is the whole margin.
6. Chrome zoom stays at 100 %. The layout is fixed at 1920×1080 CSS px; any zoom breaks it. The wall layout switches on only at 1900 px wide or more; anything narrower gets the laptop layout.

`?kiosk=1` turns on the DPR warning and the five-minute watchdog reload. On the laptop during the two-week trial, open `http://localhost:8787/` without it (or `npm run demo` with no service at all).

## 4. The laptop trial (decision 47)

```
npm ci
npm run fixtures
npm run demo        # http://localhost:5173, fixtures, no service
```
Scenarios: `http://localhost:5173/?scenario=typical` (a live-shaped day), `?scenario=huddle-day` (07:00), `?scenario=late-afternoon`, `?scenario=stale`, `?scenario=overflow`, `?scenario=busy`, `?scenario=all-clear`, `?scenario=monday-scorecard`. Add `&wall=1` to force the wall layout on a smaller screen (for driving a TV from the laptop). The clock is frozen at the scenario's time so the same picture shows on any day.

## 5. Before the mount is final

- 12-ft and 15-ft read test on the panel at 07:00 and 15:00 (`huddle-card.md`, last section). Adjust panel brightness only; never Chrome zoom, never the content.
- Pull the network cable at 09:00: amber dots by 09:10, red banner by 09:30 with yesterday's numbers still visible; reconnect and expect green within two polls.
- Reboot the PC: the service and the kiosk window must both come back without a login prompt (auto-logon for the office user, or a dedicated kiosk user).

## 6. Updating

```powershell
cd C:\SealTech\board
git pull
npm ci
npm run build
nssm restart SealTechBoard
```
The kiosk tab reloads itself within a minute (the snapshot's `build` changes; the board reloads when it does).
