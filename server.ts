import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  console.log("Starting server...");
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);

  const PORT = process.env.PORT || 3000;

  // ---------------- MongoDB ----------------
  // Using the user's provided MongoDB URL
  const MONGO_URL = process.env.MONGO_URL || "mongodb://BngBusiness:BigFatCheese!123@ac-cynf0tz-shard-00-00.fh8y0tq.mongodb.net:27017,ac-cynf0tz-shard-00-01.fh8y0tq.mongodb.net:27017,ac-cynf0tz-shard-00-02.fh8y0tq.mongodb.net:27017/?ssl=true&replicaSet=atlas-hoeyw7-shard-0&authSource=admin&appName=ChuddIO";
  let mongoConnected = false;

  mongoose.connect(MONGO_URL)
    .then(() => { console.log("MongoDB connected"); mongoConnected = true; })
    .catch(err => { console.error("MongoDB connection failed:", err); });

  const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    stats: { highScore: { type: Number, default: 0 }, totalGames: { type: Number, default: 0 } }
  });
  const User = mongoose.model("User", userSchema);

  // Parse JSON requests
  app.use(express.json());

  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    console.log("Initializing Vite in SPA mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
      root: __dirname,
    });
    app.use(vite.middlewares);
    
    // In development, Vite handles the SPA fallback automatically if appType is 'spa'.
    // If it doesn't, we can add a simple fallback here.
    app.use('*', async (req, res, next) => {
      if (req.method !== 'GET' || !req.headers.accept?.includes('text/html')) {
        return next();
      }
      try {
        let template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  }

  app.get("/api/ping", (req, res) => {
    res.json({ status: "ok", time: new Date().toISOString() });
  });

  // ---------------- Reset account ----------------
  app.post("/resetUser", async (req, res) => {
    const { username } = req.body;
    if (!mongoConnected) return res.status(500).json({ error: "MongoDB offline" });
    try {
      const result = await User.deleteOne({ username });
      if (result.deletedCount) return res.json({ success: true });
      else return res.status(404).json({ error: "User not found" });
    } catch (err) { return res.status(500).json({ error: "Server error" }); }
  });

  // ---------------- Game state ----------------
  interface Player {
    id: string;
    name: string;
    x: number;
    y: number;
    radius: number;
    alive: boolean;
    level: number;
    xp: number;
    quests: { eatFoods: number; killPlayers: number; surviveRounds: number };
    inputX: number;
    inputY: number;
    boosting: boolean;
    velocityX: number;
    velocityY: number;
    icon: number;
  }

  interface Food {
    x: number;
    y: number;
    radius: number;
  }

  let players: { [key: string]: Player } = {};
  let foods: Food[] = [];
  const WORLD_WIDTH = 1200;
  const WORLD_HEIGHT = 800;
  const FOOD_COUNT = 80;

  let roundActive = true;
  let roundTimeLeft = 180; // 3 min round

  function spawnFood(): Food { return { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT, radius: 5 }; }
  for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());

  // ---------------- Socket.io ----------------
  io.on("connection", socket => {
    console.log("Player connected:", socket.id);

    socket.on("join", async (data) => {
      try {
        const username = data.username?.trim();
        const password = data.password;
        if (!username || !password) return socket.emit("joinError", { message: "Username/password required" });

        let user: any = null;
        if (mongoConnected) {
          user = await User.findOne({ username });
          if (!user) {
            const hashed = await bcrypt.hash(password, 10);
            user = new User({ username, password: hashed });
            await user.save();
          } else {
            const match = await bcrypt.compare(password, user.password);
            if (!match) return socket.emit("joinError", { message: "Invalid password" });
          }
        }

        if (Object.values(players).some(p => p.name === username && p.alive))
          return socket.emit("joinError", { message: "Player already in game" });

        // Add player
        players[socket.id] = {
          id: socket.id,
          name: username,
          x: Math.random() * WORLD_WIDTH,
          y: Math.random() * WORLD_HEIGHT,
          radius: 15,
          alive: true,
          level: 1,
          xp: 0,
          quests: { eatFoods: 0, killPlayers: 0, surviveRounds: 0 },
          inputX: 0, inputY: 0,
          boosting: false, velocityX: 0, velocityY: 0,
          icon: 1
        };

        socket.emit("joinSuccess", { username, stats: user?.stats || {} });

      } catch (err) {
        console.error(err);
        socket.emit("joinError", { message: "Server error during join" });
      }
    });

    socket.on("movement", data => {
      const p = players[socket.id];
      if (!p || !p.alive) return;
      p.inputX = data.x;
      p.inputY = data.y;
      p.boosting = data.boost || false;
    });

    socket.on("disconnect", () => delete players[socket.id]);
  });

  // ---------------- Kill/Respawn ----------------
  function killPlayer(p: Player, killerId: string | null = null) {
    if (!p.alive) return;
    p.alive = false;
    io.to(p.id).emit("dead");

    if (killerId) io.to(p.id).emit("playerEaten");
    io.emit("playerDied", {
      victim: p.id,
      killer: killerId
    });
    setTimeout(() => respawnPlayer(p), 3000);
  }

  function respawnPlayer(p: Player) {
    if (!players[p.id]) return;

    p.x = Math.random() * WORLD_WIDTH;
    p.y = Math.random() * WORLD_HEIGHT;
    p.radius = 15;
    p.level = 1;
    p.xp = 0;
    p.icon = 1;
    p.inputX = 0;
    p.inputY = 0;
    p.velocityX = 0;
    p.velocityY = 0;
    p.boosting = false;
    p.alive = true;

    io.to(p.id).emit("respawn");
  }

  function resetRound() {
    for (let id in players) {
      const p = players[id];
      p.x = Math.random() * WORLD_WIDTH;
      p.y = Math.random() * WORLD_HEIGHT;
      p.radius = 15;
      p.level = 1;
      p.xp = 0;
      p.icon = 1;
      p.inputX = 0;
      p.inputY = 0;
      p.velocityX = 0;
      p.velocityY = 0;
      p.boosting = false;
      p.alive = true;
      io.to(p.id).emit("respawn");
    }

    foods = [];
    for (let i = 0; i < FOOD_COUNT; i++) foods.push(spawnFood());
    roundTimeLeft = 180;
    console.log("Round is reset!");
    io.emit("newRound");
  }

  // ---------------- Game Loop ----------------
  setInterval(() => {
    if (!roundActive) return;

    for (let id in players) {
      const p = players[id];
      if (!p.alive) continue;

      const speed = 0.8 / Math.sqrt(p.radius);
      if (p.boosting && p.radius > 12) {
        p.velocityX += p.inputX * speed * 2;
        p.velocityY += p.inputY * speed * 2;
        p.radius -= 0.02;
        // Emit boost sound event occasionally or on start
        if (Math.random() < 0.1) io.to(p.id).emit("boost");
      } else {
        p.velocityX += p.inputX * speed;
        p.velocityY += p.inputY * speed;
      }

      p.velocityX *= 0.9;
      p.velocityY *= 0.9;
      p.x += p.velocityX;
      p.y += p.velocityY;
      p.x = Math.max(p.radius, Math.min(WORLD_WIDTH - p.radius, p.x));
      p.y = Math.max(p.radius, Math.min(WORLD_HEIGHT - p.radius, p.y));

      for (let i = foods.length - 1; i >= 0; i--) {
        const f = foods[i];
        const dx = p.x - f.x;
        const dy = p.y - f.y;

        if (Math.sqrt(dx * dx + dy * dy) < p.radius) {
          p.radius += 0.5;
          p.xp += 1;
          foods.splice(i, 1);
          foods.push(spawnFood());
          p.quests.eatFoods += 1;
          io.to(p.id).emit("foodEaten");
          io.to(p.id).emit("questUpdate", {
            type: "eatFoods",
            amount: p.quests.eatFoods
          });
        }
      }

      if (p.xp >= p.level * 10) {
        p.level += 1;
        p.xp = 0;
        p.icon = Math.min(p.level, 8);
        io.to(p.id).emit("levelUp", p.level);
      }
    }

    const ids = Object.keys(players);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p1 = players[ids[i]];
        const p2 = players[ids[j]];
        if (!p1.alive || !p2.alive) continue;

        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < p1.radius + p2.radius) {
          if (p1.radius > p2.radius * 1.1) {
            p1.radius += p2.radius * 0.5;
            killPlayer(p2, p1.id);
          } else if (p2.radius > p1.radius * 1.1) {
            p2.radius += p1.radius * 0.5;
            killPlayer(p1, p2.id);
          }
        }
      }
    }

    const leaderboard = Object.values(players)
      .filter(p => p.alive)
      .sort((a, b) => b.radius - a.radius)
      .slice(0, 5)
      .map(p => ({ name: p.name, radius: Math.round(p.radius) }));

    roundTimeLeft -= 1 / 60;
    if (roundTimeLeft <= 0) {
      resetRound();
    }

    io.emit("state", { players, foods, leaderboard, roundTimeLeft });
  }, 1000 / 60);

  // Static files from public
  app.use(express.static(path.join(process.cwd(), "public")));

  if (process.env.NODE_ENV === "production") {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
