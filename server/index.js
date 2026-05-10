const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 存储房间信息
const rooms = new Map();

// 游戏配置
const GAME_CONFIG = {
  GRID_WIDTH: 20,
  GRID_HEIGHT: 22,
  ROAD_LEFT: 2,
  ROAD_RIGHT: 17,
  GAME_DURATION: 60,
  INITIAL_SPEED: 350
};

// 生成房间号（6位数字）
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 生成汉堡
function generateBurger() {
  const x = Math.floor(Math.random() * (GAME_CONFIG.ROAD_RIGHT - GAME_CONFIG.ROAD_LEFT - 1)) + GAME_CONFIG.ROAD_LEFT + 1;
  const y = 0;
  return { x, y, id: uuidv4() };
}

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);

  // 创建房间
  socket.on('createRoom', (callback) => {
    const roomCode = generateRoomCode();
    const room = {
      code: roomCode,
      players: new Map(),
      gameState: 'waiting', // waiting, playing, ended
      burgers: [],
      scores: { player1: 0, player2: 0 },
      positions: { player1: 6, player2: 13 },
      timeLeft: GAME_CONFIG.GAME_DURATION,
      roadOffset: 0,
      gameLoop: null,
      timerInterval: null
    };
    
    rooms.set(roomCode, room);
    socket.join(roomCode);
    
    room.players.set(socket.id, { 
      id: socket.id, 
      role: 'player1',
      ready: false 
    });
    
    console.log(`房间 ${roomCode} 创建成功`);
    callback({ success: true, roomCode, role: 'player1' });
  });

  // 加入房间
  socket.on('joinRoom', (roomCode, callback) => {
    const room = rooms.get(roomCode);
    
    if (!room) {
      callback({ success: false, error: '房间不存在' });
      return;
    }
    
    if (room.players.size >= 2) {
      callback({ success: false, error: '房间已满' });
      return;
    }
    
    socket.join(roomCode);
    room.players.set(socket.id, { 
      id: socket.id, 
      role: 'player2',
      ready: false 
    });
    
    console.log(`用户 ${socket.id} 加入房间 ${roomCode}`);
    callback({ success: true, roomCode, role: 'player2' });
    
    // 通知房主有人加入
    socket.to(roomCode).emit('playerJoined', { 
      playerId: socket.id,
      playerCount: room.players.size 
    });
  });

  // 玩家准备
  socket.on('playerReady', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    const player = room.players.get(socket.id);
    if (player) {
      player.ready = true;
      
      // 检查是否所有玩家都准备好了
      const allReady = Array.from(room.players.values()).every(p => p.ready);
      
      if (allReady && room.players.size === 2) {
        startGame(roomCode);
      } else {
        io.to(roomCode).emit('playerReady', { 
          playerId: socket.id,
          readyCount: Array.from(room.players.values()).filter(p => p.ready).length
        });
      }
    }
  });

  // 玩家移动
  socket.on('playerMove', (roomCode, direction) => {
    const room = rooms.get(roomCode);
    if (!room || room.gameState !== 'playing') return;
    
    const player = room.players.get(socket.id);
    if (!player) return;
    
    const playerKey = player.role; // 'player1' 或 'player2'
    let currentPos = room.positions[playerKey];
    let newPos = currentPos;
    
    // 计算新位置
    if (direction === 'left') {
      newPos = Math.max(GAME_CONFIG.ROAD_LEFT + 1, currentPos - 1);
    } else if (direction === 'right') {
      newPos = Math.min(GAME_CONFIG.ROAD_RIGHT - 1, currentPos + 1);
    }
    
    // 检查是否被另一个玩家占据（绕行逻辑）
    const otherPlayerKey = playerKey === 'player1' ? 'player2' : 'player1';
    const otherPos = room.positions[otherPlayerKey];
    
    if (newPos === otherPos) {
      // 尝试绕行
      if (direction === 'left') {
        newPos = Math.max(GAME_CONFIG.ROAD_LEFT + 1, newPos - 1);
      } else {
        newPos = Math.min(GAME_CONFIG.ROAD_RIGHT - 1, newPos + 1);
      }
      
      // 如果还是被占据，不能移动
      if (newPos === otherPos) {
        newPos = currentPos;
      }
    }
    
    if (newPos !== currentPos) {
      room.positions[playerKey] = newPos;
      
      // 广播位置更新
      io.to(roomCode).emit('positionUpdate', {
        player: playerKey,
        position: newPos
      });
      
      // 检查是否吃到汉堡
      checkBurgerCollision(room, roomCode, playerKey);
    }
  });

  // 开始游戏
  function startGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.gameState = 'playing';
    room.burgers = [];
    room.scores = { player1: 0, player2: 0 };
    room.positions = { player1: 6, player2: 13 };
    room.timeLeft = GAME_CONFIG.GAME_DURATION;
    room.roadOffset = 0;
    
    // 通知所有玩家游戏开始
    io.to(roomCode).emit('gameStart', {
      config: GAME_CONFIG,
      initialPositions: room.positions
    });
    
    // 游戏主循环
    room.gameLoop = setInterval(() => {
      if (room.gameState !== 'playing') return;
      
      // 更新路面偏移
      room.roadOffset = (room.roadOffset + 1) % 12;
      
      // 移动汉堡
      room.burgers = room.burgers.map(burger => ({
        ...burger,
        y: burger.y + 1
      })).filter(burger => burger.y < GAME_CONFIG.GRID_HEIGHT);
      
      // 随机生成汉堡
      if (Math.random() < 0.35) {
        room.burgers.push(generateBurger());
        if (Math.random() < 0.4) {
          room.burgers.push(generateBurger());
        }
      }
      
      // 广播游戏状态
      io.to(roomCode).emit('gameStateUpdate', {
        burgers: room.burgers,
        roadOffset: room.roadOffset,
        timeLeft: room.timeLeft,
        scores: room.scores
      });
    }, GAME_CONFIG.INITIAL_SPEED);
    
    // 计时器
    room.timerInterval = setInterval(() => {
      room.timeLeft--;
      
      if (room.timeLeft <= 0) {
        endGame(roomCode);
      }
    }, 1000);
  }

  // 检查汉堡碰撞
  function checkBurgerCollision(room, roomCode, playerKey) {
    const bikeY = GAME_CONFIG.GRID_HEIGHT - 2;
    const bikeX = room.positions[playerKey];
    
    const eatenIndex = room.burgers.findIndex(
      burger => burger.x === bikeX && burger.y === bikeY
    );
    
    if (eatenIndex !== -1) {
      const eatenBurger = room.burgers[eatenIndex];
      room.burgers.splice(eatenIndex, 1);
      room.scores[playerKey] += 10;
      
      // 广播吃汉堡事件
      io.to(roomCode).emit('burgerEaten', {
        player: playerKey,
        burger: eatenBurger,
        score: room.scores[playerKey],
        scores: room.scores
      });
    }
  }

  // 结束游戏
  function endGame(roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;
    
    room.gameState = 'ended';
    
    if (room.gameLoop) {
      clearInterval(room.gameLoop);
      room.gameLoop = null;
    }
    
    if (room.timerInterval) {
      clearInterval(room.timerInterval);
      room.timerInterval = null;
    }
    
    // 确定获胜者
    let winner = null;
    if (room.scores.player1 > room.scores.player2) {
      winner = 'player1';
    } else if (room.scores.player2 > room.scores.player1) {
      winner = 'player2';
    } else {
      winner = 'tie';
    }
    
    io.to(roomCode).emit('gameEnd', {
      winner,
      scores: room.scores
    });
  }

  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
    
    // 清理房间
    for (const [roomCode, room] of rooms.entries()) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        
        // 如果游戏正在进行，结束游戏
        if (room.gameState === 'playing') {
          endGame(roomCode);
          io.to(roomCode).emit('playerDisconnected', { 
            playerId: socket.id 
          });
        }
        
        // 如果房间空了，删除房间
        if (room.players.size === 0) {
          if (room.gameLoop) clearInterval(room.gameLoop);
          if (room.timerInterval) clearInterval(room.timerInterval);
          rooms.delete(roomCode);
          console.log(`房间 ${roomCode} 已删除`);
        }
        
        break;
      }
    }
  });
});

// 健康检查
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '辣堡对战服务器运行中',
    rooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// 获取房间列表（调试用）
app.get('/rooms', (req, res) => {
  const roomList = [];
  for (const [code, room] of rooms.entries()) {
    roomList.push({
      code,
      playerCount: room.players.size,
      gameState: room.gameState,
      scores: room.scores
    });
  }
  res.json(roomList);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
