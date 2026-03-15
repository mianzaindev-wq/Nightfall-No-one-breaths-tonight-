<div align="center">

# 🗡 NIGHTFALL

### *No One Breathes Tonight*

**A real-time multiplayer murder mystery game — self-contained in a single HTML file.**

[![License: Custom](https://img.shields.io/badge/License-Personal%20Use%20Only-red.svg)](#license)
![Players](https://img.shields.io/badge/Players-4%20to%2016-gold)
![Zero Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen)
![Platform](https://img.shields.io/badge/Platform-Any%20Browser-blue)

---

*When night falls, trust is a luxury the dead can't afford.*

</div>

## 🎮 What is NightFall?

**NightFall** is a browser-based social deduction game inspired by classics like Mafia and Werewolf. Players are secretly assigned roles — **Killer**, **Detective**, or **Civilian** — and must survive the night through deception, investigation, and democratic justice.

The entire game runs from **a single HTML file** with **zero dependencies**, **zero servers**, and **zero installations**. Open the file, share the lobby code, and play.

---

## ✨ Features

| Feature | Details |
|---|---|
| **Real Multiplayer** | Play across multiple tabs, windows, or devices on the same network |
| **Zero Setup** | No npm, no build step, no backend — just one `.html` file |
| **4–16 Players** | Scales from small groups to large parties |
| **3 Unique Roles** | Killer 🗡, Detective 🔍, Civilian 🧑 — each with distinct night actions |
| **Day/Night Cycle** | Timed phases with atmospheric transitions |
| **Voting System** | Democratic elimination with real-time vote tallies and visual breakdowns |
| **Detective Clues** | Timed investigations that provide evidence to the town |
| **Sound Design** | Procedurally generated audio effects using the Web Audio API |
| **Animated Background** | Canvas-rendered night sky with twinkling stars and moonlight |
| **Responsive UI** | Dark, cinematic aesthetic — plays beautifully on desktop and mobile |
| **Instant Replay** | "Play Again" returns the lobby instantly after each game |

---

## 🚀 Getting Started

### Quick Start (Same Device)

1. Open `NightFall.html` in your browser.
2. Enter your name and **Create Lobby**.
3. Open additional tabs/windows for other players.
4. Each new player enters the **6-character lobby code** and joins.
5. Once 4+ players are in, the host clicks **"Begin the Night"**.

### Cross-Device Play (LAN / Remote)

To play across different devices, serve the file over HTTP so all players share the same origin:

**Option A — Python (built-in)**
```bash
# Navigate to the folder containing NightFall.html
cd path/to/NightFall

# Python 3
python -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

**Option B — Node.js**
```bash
npx -y serve .
```

**Option C — PHP**
```bash
php -S 0.0.0.0:8080
```

**Option D — VS Code**
> Install the **Live Server** extension → right-click `NightFall.html` → **Open with Live Server**.

Then share your local IP (e.g., `http://192.168.1.X:8080/NightFall.html`) with all players on the same network.

> **Tip:** For remote play over the internet, use a tunneling service like [ngrok](https://ngrok.com/), [localhost.run](https://localhost.run), or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

---

## 🎭 How to Play

### Roles

| Role | Ability | Win Condition |
|---|---|---|
| 🗡 **Killer** | Choose a victim each night | Outnumber or equal the remaining players |
| 🔍 **Detective** | Investigate one player per night (timed) | Eliminate all killers |
| 🧑 **Civilian** | No special power — observe and vote wisely | Eliminate all killers |

### Game Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  LOBBY   │────▶│  NIGHT   │────▶│   DAY    │────▶│ VERDICT  │
│          │     │          │     │          │     │          │
│ 4-16     │     │ Killers  │     │ 60s to   │     │ Votes    │
│ players  │     │ choose a │     │ discuss  │     │ tallied  │
│ join     │     │ victim   │     │ & vote   │     │ & reveal │
└──────────┘     └──────────┘     └──────────┘     └────┬─────┘
                       ▲                                 │
                       └─────────────────────────────────┘
                              (until win condition)
```

1. **Lobby** — Players join via lobby code. Host starts the game.
2. **Role Reveal** — Each player privately sees their assigned role.
3. **Night** — Killers select a target. Detectives investigate. Civilians sleep.
4. **Day** — The murdered player is announced. Detective clues appear. Players discuss and vote.
5. **Verdict** — The player with the most votes is executed; their role is revealed.
6. **Repeat** — Night/Day cycles continue until one side wins.

### Win Conditions

- **Civilians win** when all killers are eliminated.
- **Killers win** when they equal or outnumber the remaining non-killers.

---

## 🛠 Technical Details

| Aspect | Implementation |
|---|---|
| **Transport** | [BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel) — real-time cross-tab/window messaging |
| **Audio** | Web Audio API — procedurally generated sound effects (no audio files) |
| **Graphics** | HTML5 Canvas — animated starfield, moon, and visual effects |
| **Styling** | CSS custom properties, gradients, keyframe animations, glassmorphism |
| **Typography** | Google Fonts — Cinzel Decorative, Crimson Text, Share Tech Mono |
| **State Mgmt** | Host-authoritative model — the lobby creator manages game state |
| **File Size** | ~40 KB — single self-contained HTML file |

### Browser Support

Any modern browser that supports the BroadcastChannel API:

- ✅ Chrome / Edge 54+
- ✅ Firefox 38+
- ✅ Safari 15.4+
- ✅ Opera 41+
- ❌ Internet Explorer (not supported)

---

## 📁 Project Structure

```
NightFall/
├── NightFall.html    # The entire game — HTML, CSS, and JS in one file
├── README.md         # This file
└── LICENSE           # Personal use license
```

That's it. No build tools. No node_modules. No config files. Just one file that does everything.

---

## ⚠️ Known Limitations

- **BroadcastChannel** only works across tabs/windows on the **same origin**. For cross-device play, you must serve the file via an HTTP server (see [Getting Started](#-getting-started)).
- **No persistence** — game state lives in memory. Refreshing the page disconnects you.
- **No chat** — communication happens face-to-face or through an external voice/text channel.

---

## 📜 License

This project is licensed under a **custom personal-use license**.

- ✅ **Personal entertainment** — You may use, copy, and share this game freely for personal, non-commercial enjoyment.
- ❌ **Commercial use is strictly prohibited** — This includes but is not limited to: selling, sublicensing, monetizing, embedding in commercial products, using in paid events, or any form of commercial exploitation.

See [LICENSE](./LICENSE) for full terms.

**© 2025–2026 Zain Waqar. All rights reserved.**

---

## 🤝 Contributing

Contributions are welcome for personal/community improvement! If you'd like to contribute:

1. **Fork** the repository
2. Create a **feature branch** (`git checkout -b feature/your-feature`)
3. **Commit** your changes (`git commit -m "Add: your feature"`)
4. **Push** to the branch (`git push origin feature/your-feature`)
5. Open a **Pull Request**

> **Note:** All contributions fall under the same license terms. Commercial use of derivative works is prohibited.

---

## 💬 Support

If you encounter bugs or have feature requests, please [open an issue](../../issues).

---

<div align="center">

*Built with nothing but HTML, CSS, JavaScript, and a love for murder mysteries.*

**NIGHTFALL** — *No One Breathes Tonight*

</div>
