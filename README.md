# Sawaari — The Conductor's Digital Companion

A case study + working prototype that digitizes the bus conductor's ticketing machine (ETM) for one-handed use in a moving bus: destination prediction, a direct-set count pad, cash-change calculator with UPI failover, offline queueing, and a live 4-second test.

**Live site:** https://aryns293.github.io/sawaari-conductor/

## Run locally

No build step, no dependencies:

```bash
# any static server works
python3 -m http.server 8741
# open http://localhost:8741
```

Or just open `index.html` in a browser.

## Try

- **Run the 4-second test** — scripted demo with a live stopwatch (target: 3 passengers, under 4s)
- **Stress toggles** — glare simulation, left-hand mode, offline queueing, printer-off (QR ticket failover)
- Keyboard: `+` / `−` / digit keys count passengers, `Enter` issues, `Esc` goes back

## Stack

Plain HTML, CSS and JavaScript — three files, zero dependencies.
