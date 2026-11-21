# FAULTLINE

**FAULTLINE** is a daily power-routing and fault-containment puzzle built for **Reddit Devvit Web**. Every day presents a fragile 6×6 schematic grid mid-cascade—reroute power from every **Source** to every **Core** while keeping all **Overload** nodes isolated, beat par, and share a spoiler-free solve summary in the subreddit thread.

---

## Gameplay & Mechanics

* **Grid & Nodes (6×6):**
  * **Source (`SRC`):** Emits live power into connected conduit ports.
  * **Core (`CORE`):** Must receive power to stabilize the grid.
  * **Overload (`OVL`):** Volatile hazard nodes—routing power into an Overload triggers a cascade failure.
  * **Conduits & Breakers:** Click tiles to rotate straight, corner, and T-junction conduits or toggle circuit breakers.
* **Live BFS Simulation:** Every move recalculates power propagation across directional ports (`N`, `E`, `S`, `W`) in real time.
* **Par & Lockout Stakes:**
  * Solve at or under **`parMoves`** to achieve **Clean Containment**.
  * Exceeding **`maxMoves`** locks out the grid for the day.
* **Community Loop:** Tracks daily streaks and best move counts, generating a 1-click, spoiler-free grid summary formatted for Reddit comment threads.

---

## Tech Stack

* **Platform:** Reddit Devvit Web
* **Frontend:** React, TypeScript, Vite, Tailwind CSS
* **Graphics:** Custom inline SVG schematic components locked to `100dvh`

---

## Local Development

```bash
# Install dependencies
npm install

# Run locally in browser
npm run dev

#Log in to Reddit Developer CLI
npx devvit login

# Upload app to developers.reddit.com
npx devvit upload

# Test inside a Devvit playtest subreddit
npx devvit playtest <your-test-subreddit>

Project Structure
├── index.html          # Viewport-locked entry document
├── package.json        # Dependencies and scripts
└── src/
    ├── types.ts        # Grid, tile, port, and simulation types
    ├── puzzles.ts      # Calibrated daily boards with par/max thresholds
    └── App.tsx         # BFS power-routing engine, SVG schematic UI & end card
