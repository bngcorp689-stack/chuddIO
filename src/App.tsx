import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

export default function App() {
  console.log("App component rendering...");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [gameState, setGameState] = useState<any>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [joinMessage, setJoinMessage] = useState('');
  const [showMenu, setShowMenu] = useState(true);
  const [showDeath, setShowDeath] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [showNewRound, setShowNewRound] = useState(false);
  const [roundTime, setRoundTime] = useState('0:00');
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const keys = useRef<{ [key: string]: boolean }>({});
  const camera = useRef({ x: 0, y: 0 });
  const icons = useRef<{ [key: number]: HTMLImageElement }>({});
  const bgImage = useRef<HTMLImageElement | null>(null);

  const levelNames = [
    "chuddy", "chudder", "chuddis", "chuddmen", 
    "chadlite", "chad", "adamlite", "adam"
  ];

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<{ [key: string]: AudioBuffer }>({});
  const ambientSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ambientGainRef = useRef<GainNode | null>(null);

  useEffect(() => {
    const initAudio = async () => {
      // Check assets health
      fetch("/api/assets-check")
        .then(res => res.json())
        .then(data => console.log("Assets Health Check:", data))
        .catch(err => console.error("Assets Health Check Failed:", err));

      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log("AudioContext initialized:", audioContextRef.current.state);
      } catch (e) {
        console.error("Failed to initialize AudioContext:", e);
      }

      const soundPaths: { [key: string]: string } = {
        eatFood: `/assets/eat-food.mp3?v=${Date.now()}`,
        eatPlayer: `/assets/eat-player.mp3?v=${Date.now()}`,
        levelUp: `/assets/level-up.mp3?v=${Date.now()}`,
        death: `/assets/death.mp3?v=${Date.now()}`,
        boost: `/assets/Boost.mp3?v=${Date.now()}`,
        ambient: `/assets/ambient.mp3?v=${Date.now()}`
      };

      for (const [key, src] of Object.entries(soundPaths)) {
        let success = false;
        let attempts = 0;
        const maxAttempts = 3;

        while (!success && attempts < maxAttempts) {
          try {
            attempts++;
            console.log(`Fetching audio: ${key} from ${src} (attempt ${attempts})`);
            const response = await fetch(src, { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const contentType = response.headers.get('content-type');
            console.log(`${key} response content-type: ${contentType}`);
            
            const arrayBuffer = await response.arrayBuffer();
            console.log(`${key} fetched buffer size: ${arrayBuffer.byteLength} bytes`);

            if (arrayBuffer.byteLength < 100) {
              const text = new TextDecoder().decode(arrayBuffer.slice(0, 100));
              console.warn(`${key} buffer is very small, might be text: ${text}`);
            }
            
            if (audioContextRef.current) {
              try {
                const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                audioBuffersRef.current[key] = audioBuffer;
                console.log(`Successfully decoded audio: ${key} (attempt ${attempts})`);
                success = true;
              } catch (decodeErr) {
                console.error(`decodeAudioData failed for ${key}:`, decodeErr);
                throw decodeErr; // Trigger retry
              }
            }
          } catch (err) {
            console.error(`Attempt ${attempts} failed for ${key} (${src}):`, err);
            if (attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
            } else {
              console.error(`Final failure for ${key}:`, err);
            }
          }
        }
      }
    };

    initAudio();

    // Load icons - Mapping provided images to levels
    const localPaths: { [key: number]: string } = {
      1: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::4a4952e446864977:000001f0b09018bc:00064d2d2d7c936f",
      2: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::2d0551826d4130a5:000001f0b09018bc:00064d2d2d7c936f",
      3: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::0ec5a7f864003855:000001f0b09018bc:00064d2d2d7c936f",
      4: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::e8897c565bc34206:000001f0b09018bc:00064d2d2d7c936f",
      5: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::d13dbcbc117a6bb0:000001f0b09018bc:00064d2d2d7c936f",
      6: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::6f7d123e00b76341:000001f0b09018bc:00064d2d2d7c936f",
      7: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::95c111a036fc5b13:000001f0b09018bc:00064d2d2d7c936f",
      8: "https://aistudio.google.com/_/upload/c8f5bc8a-31a3-4cc5-b767-96ac3aaf2969/attachment/1773706292.497147000/blobstore/prod/makersuite/spanner_managed/global::000054e2ea70026d:0000015f:2:000054e2ea70026d:0000000000000001::b401e71a2a3d5262:000001f0b09018bc:00064d2d2d7c936f",
    };

    Object.entries(localPaths).forEach(([key, src]) => {
      const img = new Image();
      img.src = src;
      img.onload = () => {
        console.log(`Loaded icon: ${src}`);
        icons.current[parseInt(key)] = img;
      };
      img.onerror = () => {
        console.warn(`Failed to load icon: ${src}, using fallback.`);
        const fallbackImg = new Image();
        fallbackImg.src = `https://api.dicebear.com/7.x/identicon/svg?seed=${levelNames[parseInt(key)-1]}`;
        fallbackImg.onload = () => {
          icons.current[parseInt(key)] = fallbackImg;
        };
      };
    });

    // Load background image
    const bg = new Image();
    bg.src = "https://p.turbosquid.com/ts-thumb/rd/GkS8Rb/Yv/oblockchicago_night/png/1623271800/1920x1080/fit_q87/2782348ed40bc99007a80816f9539cebf580375c/oblockchicago_night.jpg";
    bg.onload = () => {
      bgImage.current = bg;
    };

    const handleKeyDown = (e: KeyboardEvent) => keys.current[e.key] = true;
    const handleKeyUp = (e: KeyboardEvent) => keys.current[e.key] = false;
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    const unlockAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log("AudioContext resumed via interaction");
        });
      }
      window.removeEventListener('mousedown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('mousedown', unlockAudio);
    window.addEventListener('touchstart', unlockAudio);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
      
      if (ambientSourceRef.current) {
        ambientSourceRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playSound = (key: string, loop = false, volume = 1.0, forceMuted?: boolean) => {
    if (!audioContextRef.current || !audioBuffersRef.current[key]) return;
    
    const muted = forceMuted !== undefined ? forceMuted : isMuted;
    
    // Don't play sound effects if muted
    if (muted && key !== 'ambient') return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const source = audioContextRef.current.createBufferSource();
    source.buffer = audioBuffersRef.current[key];
    source.loop = loop;

    const gainNode = audioContextRef.current.createGain();
    // If muted, set ambient volume to 0
    gainNode.gain.value = (muted && key === 'ambient') ? 0 : volume;

    source.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);

    source.start(0);

    if (key === 'ambient') {
      if (ambientSourceRef.current) {
        try { ambientSourceRef.current.stop(); } catch(e) {}
      }
      ambientSourceRef.current = source;
      ambientGainRef.current = gainNode;
    }

    return { source, gainNode };
  };

  const [isMuted, setIsMuted] = useState(false);

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    
    if (newMuted) {
      if (ambientGainRef.current) ambientGainRef.current.gain.value = 0;
    } else {
      if (ambientGainRef.current) {
        ambientGainRef.current.gain.value = 0.5;
      } else {
        // If ambient wasn't started because it was muted, start it now
        playSound('ambient', true, 0.5, false);
      }
    }
  };

  const handleJoin = () => {
    if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    // Start ambient
    playSound('ambient', true, 0.5);

    if (!username || !password) {
      setJoinMessage("Username & password required");
      return;
    }

    const newSocket = io();
    setSocket(newSocket);

    newSocket.on("connect_error", () => {
      setJoinMessage("Cannot connect to server");
    });

    newSocket.on("joinSuccess", (data: any) => {
      setJoinMessage("Welcome " + data.username);
      setShowMenu(false);
      // Ambient is already started in handleJoin
    });

    newSocket.on("joinError", (data: any) => setJoinMessage(data.message));

    newSocket.on("dead", () => {
      setShowDeath(true);
      playSound('death');
    });

    newSocket.on("respawn", () => {
      setShowDeath(false);
    });

    newSocket.on("levelUp", () => {
      setShowLevelUp(true);
      playSound('levelUp');
      setTimeout(() => setShowLevelUp(false), 1500);
    });

    newSocket.on("foodEaten", () => {
      playSound('eatFood');
    });

    newSocket.on("playerEaten", () => {
      playSound('eatPlayer');
    });

    newSocket.on("boost", () => {
      playSound('boost');
    });

    newSocket.on("newRound", () => {
      setShowNewRound(true);
      setTimeout(() => setShowNewRound(false), 2000);
    });

    newSocket.on("state", (data: any) => {
      setGameState(data);
      setLeaderboard(data.leaderboard);
      
      if (data.roundTimeLeft !== undefined) {
        const seconds = Math.max(0, Math.floor(data.roundTimeLeft));
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        setRoundTime(`${minutes}:${secs.toString().padStart(2, "0")}`);
      }
    });

    newSocket.emit("join", { username, password });
  };

  const handleReset = async () => {
    if (!username) return setJoinMessage("Enter username first");
    try {
      const res = await fetch("/resetUser", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username })
      });
      const json = await res.json();
      setJoinMessage(json.success ? "Account reset successfully" : json.error);
    } catch (err) {
      setJoinMessage("Server error");
    }
  };

  useEffect(() => {
    if (!socket) return;

    const interval = setInterval(() => {
      let dx = 0, dy = 0;
      if (keys.current.w || keys.current.ArrowUp) dy = -5;
      if (keys.current.s || keys.current.ArrowDown) dy = 5;
      if (keys.current.a || keys.current.ArrowLeft) dx = -5;
      if (keys.current.d || keys.current.ArrowRight) dx = 5;
      socket.emit("movement", { x: dx, y: dy, boost: keys.current.Shift });
    }, 1000 / 30);

    return () => clearInterval(interval);
  }, [socket]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (gameState && socket) {
        const { players, foods } = gameState;
        const me = players[socket.id];

        if (me) {
          camera.current.x = me.x - canvas.width / 2;
          camera.current.y = me.y - canvas.height / 2;

          // Draw background image
          if (bgImage.current && bgImage.current.complete) {
            // The world size is 1200x800 as per server.ts
            ctx.drawImage(bgImage.current, -camera.current.x, -camera.current.y, 1200, 800);
          } else {
            // Fallback background
            ctx.fillStyle = "#111";
            ctx.fillRect(-camera.current.x, -camera.current.y, 1200, 800);
          }

          // Draw world bounds
          ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
          ctx.lineWidth = 5;
          ctx.strokeRect(-camera.current.x, -camera.current.y, 1200, 800);

          // Draw foods
          foods.forEach((f: any) => {
            ctx.fillStyle = "yellow";
            ctx.beginPath();
            ctx.arc(f.x - camera.current.x, f.y - camera.current.y, f.radius, 0, Math.PI * 2);
            ctx.fill();
          });

          // Draw players
          Object.values(players).forEach((p: any) => {
            if (!p.alive) return;

            const iconIndex = p.icon || 1;
            const icon = icons.current[iconIndex];

            if (icon && icon.complete) {
              ctx.save();
              ctx.translate(p.x - camera.current.x, p.y - camera.current.y);
              ctx.rotate(Date.now() / 500);
              ctx.drawImage(icon, -p.radius, -p.radius, p.radius * 2, p.radius * 2);
              ctx.restore();
            } else {
              ctx.fillStyle = (p.id === socket.id) ? "cyan" : "#0f0";
              ctx.beginPath();
              ctx.arc(p.x - camera.current.x, p.y - camera.current.y, p.radius, 0, Math.PI * 2);
              ctx.fill();
            }

            // Draw name
            ctx.fillStyle = "white";
            ctx.font = "12px Arial";
            ctx.textAlign = "center";
            ctx.fillText(p.name, p.x - camera.current.x, p.y - camera.current.y - p.radius - 5);
          });
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, socket]);

  return (
    <div className="relative w-full h-screen bg-neutral-900 overflow-hidden font-sans">
      <canvas ref={canvasRef} className="block w-full h-full" />

      {/* UI Overlays */}
      {showMenu && (
        <div className="absolute inset-0 flex items-center justify-center z-50 overflow-hidden">
          {/* Split Background */}
          <div className="absolute inset-0 flex">
            {/* Left: Burger Joint (The Chudd Side) */}
            <div className="w-1/2 h-full relative overflow-hidden bg-amber-900">
              <img 
                src="https://media.craiyon.com/2025-07-25/iMi_xClhTlKItX854nawiA.webp" 
                className="absolute inset-0 w-full h-full object-cover opacity-60"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 pointer-events-none">
                <div className="relative group">
                  <img 
                    src="https://c8.alamy.com/comp/2RPKHXN/fat-male-cartoon-character-illustration-2RPKHXN.jpg" 
                    className="w-full max-w-md drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-bounce"
                    style={{ animationDuration: '4s' }}
                    referrerPolicy="no-referrer"
                  />
                  {/* Stinky steam effects */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex gap-4 opacity-60">
                    <span className="text-4xl animate-pulse">🤢</span>
                    <span className="text-4xl animate-pulse delay-75">🍔</span>
                    <span className="text-4xl animate-pulse delay-150">💨</span>
                  </div>
                </div>
                <div className="bg-black/60 backdrop-blur-sm p-4 rounded-2xl mt-8 border-2 border-amber-600/50">
                  <p className="text-amber-400 font-black text-3xl uppercase tracking-tighter text-center">The Greasy Chudd</p>
                  <p className="text-white/70 text-sm text-center mt-1">"I'll have two number 9s..."</p>
                </div>
              </div>
            </div>
            
            {/* Right: Gym (The Chad Side) */}
            <div className="w-1/2 h-full relative overflow-hidden bg-emerald-900">
              <img 
                src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRjslrT7LJjc7IZXeAldgKQF-c133AiCFvFOg&s" 
                className="absolute inset-0 w-full h-full object-cover opacity-60"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center p-12 pointer-events-none">
                <div className="relative">
                  <img 
                    src="https://img.freepik.com/free-vector/handsome-young-man-showing-hand-signal_1308-41562.jpg?semt=ais_hybrid&w=740&q=80" 
                    className="w-full max-w-md drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-pulse"
                    style={{ animationDuration: '2s' }}
                    referrerPolicy="no-referrer"
                  />
                  {/* Gym effects */}
                  <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex gap-4 opacity-80">
                    <span className="text-4xl animate-bounce">💪</span>
                    <span className="text-4xl animate-bounce delay-100">✨</span>
                    <span className="text-4xl animate-bounce delay-200">🥗</span>
                  </div>
                </div>
                <div className="bg-black/60 backdrop-blur-sm p-4 rounded-2xl mt-8 border-2 border-emerald-500/50">
                  <p className="text-emerald-400 font-black text-3xl uppercase tracking-tighter text-center">The Giga Chad</p>
                  <p className="text-white/70 text-sm text-center mt-1">"Consistency is key, bro."</p>
                </div>
              </div>
            </div>
          </div>

          {/* Menu Box */}
          <div className="relative bg-neutral-900/90 backdrop-blur-2xl p-10 rounded-[2.5rem] border-4 border-white/10 shadow-[0_0_100px_rgba(0,0,0,0.8)] w-[28rem] flex flex-col gap-6 z-10">
            <div className="text-center">
              <h1 className="text-6xl font-black text-white tracking-tighter italic drop-shadow-lg">CHUDD.IO</h1>
              <p className="text-neutral-400 text-sm mt-2 font-mono uppercase tracking-[0.3em]">Evolution Simulator</p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Username"
                  className="w-full bg-white/5 text-white p-4 rounded-2xl border-2 border-white/10 outline-none focus:border-emerald-500 transition-all text-lg"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Password"
                  className="w-full bg-white/5 text-white p-4 rounded-2xl border-2 border-white/10 outline-none focus:border-emerald-500 transition-all text-lg"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={handleJoin}
              className="group relative bg-emerald-600 hover:bg-emerald-500 text-white font-black py-5 rounded-2xl transition-all shadow-[0_10px_30px_rgba(16,185,129,0.3)] active:scale-95 overflow-hidden"
            >
              <span className="relative z-10 text-xl uppercase tracking-widest">Start Evolution</span>
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
            </button>

            <div className="flex flex-col items-center gap-2">
              <button
                onClick={handleReset}
                className="text-neutral-500 hover:text-white text-xs transition-colors uppercase tracking-widest font-bold"
              >
                Reset Account Data
              </button>
              <button 
                onClick={() => {
                  console.log("Manual sound test (eatFood)...");
                  playSound('eatFood');
                }}
                className="text-emerald-500/50 hover:text-emerald-400 text-[10px] transition-colors uppercase tracking-[0.2em] font-bold mt-2"
              >
                🔊 Test Sound System
              </button>
              {joinMessage && (
                <div className="bg-red-500/20 border border-red-500/50 p-3 rounded-xl w-full">
                  <p className="text-red-400 text-xs text-center font-bold">{joinMessage}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showDeath && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/40 z-40">
          <h2 className="text-8xl font-black text-red-500 tracking-tighter animate-pulse">YOU DIED</h2>
        </div>
      )}

      {showLevelUp && (
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 z-40">
          <h2 className="text-6xl font-black text-yellow-400 tracking-tighter animate-bounce">LEVEL UP!</h2>
        </div>
      )}

      {showNewRound && (
        <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
          <h2 className="text-7xl font-black text-emerald-400 tracking-tighter animate-in fade-in zoom-in duration-500">NEW ROUND!</h2>
        </div>
      )}

      {/* HUD */}
      {!showMenu && (
        <>
          <div className="absolute top-4 left-4 flex gap-4">
            <div className="bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white">
              <p className="text-sm font-mono text-neutral-400 uppercase tracking-widest mb-1">Time Left</p>
              <p className="text-2xl font-bold">{roundTime}</p>
            </div>
            
            <div className="bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white min-w-[120px]">
              <p className="text-sm font-mono text-neutral-400 uppercase tracking-widest mb-1">Rank</p>
              <p className="text-2xl font-bold text-emerald-400">
                {(() => {
                  const level = gameState?.players?.[socket?.id || ""]?.level || 1;
                  const name = levelNames[Math.min(Math.max(0, level - 1), 7)];
                  return name.charAt(0).toUpperCase() + name.slice(1);
                })()}
              </p>
            </div>

            <button 
              onClick={toggleMute}
              className="bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white hover:bg-white/10 transition-colors"
            >
              {isMuted ? "🔇" : "🔊"}
            </button>
          </div>

          <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 text-white w-48">
            <h3 className="text-xs font-mono text-neutral-400 uppercase tracking-widest mb-3 border-b border-white/10 pb-2">Leaderboard</h3>
            <ol className="flex flex-col gap-2">
              {leaderboard.map((p, i) => (
                <li key={i} className="flex justify-between items-center text-sm">
                  <span className="truncate max-w-[100px]">{i + 1}. {p.name}</span>
                  <span className="font-mono text-emerald-400">{p.radius}</span>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </div>
  );
}
