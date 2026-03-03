require("dotenv").config();
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

const app = require("./app");
const prisma = require("./config/prisma");

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await prisma.$connect();
    console.log("✅ Database connected");

    const server = http.createServer(app);

    const io = new Server(server, {
      cors: {
        origin: "*",
      },
    });

    const rooms = {};

    // ================================
    // SOCKET AUTH
    // ================================
    io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error("Authentication error"));

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
      } catch {
        next(new Error("Authentication error"));
      }
    });

    // ================================
    // GAME ENGINE FUNCTIONS
    // ================================
    function resolveBall(roomId) {
      const room = rooms[roomId];
      const game = room.game;

      const bat = game.currentBall.batChoice;
      const bowl = game.currentBall.bowlChoice;

      if (bat === bowl) {
        game.wickets[game.battingTeam] += 1;

        game.batsmanQueue[game.battingTeam].shift();
        game.currentBatsman =
          game.batsmanQueue[game.battingTeam][0] || null;
      } else {
        game.score[game.battingTeam] += bat;
      }

      game.currentBall = {
        batChoice: null,
        bowlChoice: null,
      };

      if (!game.currentBatsman) {
        if (game.currentInnings === 1) {
          switchInnings(roomId);
        } else {
          endMatch(roomId);
        }
        return;
      }

      io.to(roomId).emit("scoreUpdate", {
        score: game.score,
        wickets: game.wickets,
        currentBatsman: game.currentBatsman,
        currentBowler: game.currentBowler,
      });
    }

    function switchInnings(roomId) {
      const room = rooms[roomId];
      const game = room.game;

      game.currentInnings = 2;

      const oldBatting = game.battingTeam;
      game.battingTeam = game.bowlingTeam;
      game.bowlingTeam = oldBatting;

      game.currentBatsman =
        game.batsmanQueue[game.battingTeam][0] || null;

      game.currentBowler =
        game.batsmanQueue[game.bowlingTeam][0] || null;

      io.to(roomId).emit("inningsSwitched", {
        battingTeam: game.battingTeam,
        score: game.score,
      });
    }

    function endMatch(roomId) {
      const room = rooms[roomId];
      const game = room.game;

      let winner = "DRAW";

      if (game.score.A > game.score.B) winner = "A";
      if (game.score.B > game.score.A) winner = "B";

      io.to(roomId).emit("matchEnded", {
        finalScore: game.score,
        winner,
      });

      room.gameStarted = false;
    }

    // ================================
    // SOCKET CONNECTION
    // ================================
    io.on("connection", (socket) => {
      console.log("⚡ User connected:", socket.id);

      // CREATE ROOM
      socket.on("createRoom", () => {
        const roomId = Math.random().toString(36).substring(2, 8);

        rooms[roomId] = {
          hostId: socket.user.userId,
          players: [
            { userId: socket.user.userId, socketId: socket.id }
          ],
          teams: { A: [], B: [] },
          commonPlayer: null,
          gameStarted: false,
        };

        socket.join(roomId);
        socket.emit("roomCreated", roomId);
      });

      // JOIN ROOM
      socket.on("joinRoom", (roomId) => {
        const room = rooms[roomId];
        if (!room) return socket.emit("errorMessage", "Room not found");

        if (room.players.length >= 8)
          return socket.emit("errorMessage", "Room full");

        room.players.push({
          userId: socket.user.userId,
          socketId: socket.id,
        });

        socket.join(roomId);
        io.to(roomId).emit("roomUpdate", room.players);
      });

      // TEAM SELECTION
      socket.on("selectTeam", ({ roomId, team }) => {
        const room = rooms[roomId];
        if (!room || room.gameStarted) return;

        const userId = socket.user.userId;

        room.teams.A = room.teams.A.filter(id => id !== userId);
        room.teams.B = room.teams.B.filter(id => id !== userId);

        if (team === "A") room.teams.A.push(userId);
        if (team === "B") room.teams.B.push(userId);

        io.to(roomId).emit("teamUpdate", room.teams);
      });

      // START MATCH
      socket.on("startMatch", (roomId) => {
        const room = rooms[roomId];
        if (!room) return;

        if (room.hostId !== socket.user.userId)
          return socket.emit("errorMessage", "Only host can start");

        room.gameStarted = true;

        room.game = {
          currentInnings: 1,
          battingTeam: "A",
          bowlingTeam: "B",
          score: { A: 0, B: 0 },
          wickets: { A: 0, B: 0 },
          batsmanQueue: {
            A: [...room.teams.A],
            B: [...room.teams.B],
          },
          currentBatsman: room.teams.A[0] || null,
          currentBowler: room.teams.B[0] || null,
          currentBall: {
            batChoice: null,
            bowlChoice: null,
          },
        };

        io.to(roomId).emit("matchStarted", room.game);
      });

      // PLAY BALL
      socket.on("playBall", ({ roomId, number }) => {
        const room = rooms[roomId];
        if (!room || !room.gameStarted) return;

        const game = room.game;
        const userId = socket.user.userId;

        if (number < 1 || number > 6) return;

        if (
          userId !== game.currentBatsman &&
          userId !== game.currentBowler
        ) {
          return socket.emit("errorMessage", "Not your turn");
        }

        if (userId === game.currentBatsman) {
          if (game.currentBall.batChoice !== null) return;
          game.currentBall.batChoice = number;
        }

        if (userId === game.currentBowler) {
          if (game.currentBall.bowlChoice !== null) return;
          game.currentBall.bowlChoice = number;
        }

        if (
          game.currentBall.batChoice !== null &&
          game.currentBall.bowlChoice !== null
        ) {
          resolveBall(roomId);
        }
      });

      // DISCONNECT
      socket.on("disconnect", () => {
        for (const roomId in rooms) {
          const room = rooms[roomId];

          room.players = room.players.filter(
            p => p.socketId !== socket.id
          );

          room.teams.A = room.teams.A.filter(
            id => id !== socket.user?.userId
          );
          room.teams.B = room.teams.B.filter(
            id => id !== socket.user?.userId
          );

          if (room.players.length === 0) {
            delete rooms[roomId];
          } else {
            io.to(roomId).emit("roomUpdate", room.players);
          }
        }
      });
    });

    server.listen(PORT, () => {
      console.log(`🚀 Server started on port ${PORT}`);
    });

  } catch (error) {
    console.error("❌ Failed to connect:", error);
    process.exit(1);
  }
}

startServer();