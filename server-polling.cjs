// 使用 HTTP 长轮询的服务器 - 最可靠的方案
const http = require('http');
const crypto = require('crypto');

// 存储客户端和房间
const clients = new Map();
const rooms = new Map();

// 生成唯一ID
function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// 生成房间码
function generateRoomCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 处理请求
function handleRequest(req, res) {
  // 设置 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 解析请求体
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    let data = {};
    try {
      if (body) data = JSON.parse(body);
    } catch (e) {}
    
    const path = req.url;
    
    // 主页
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        message: '辣堡对战服务器运行中 (HTTP Polling)',
        timestamp: new Date().toISOString()
      }));
      return;
    }
    
    // 注册客户端
    if (path === '/api/register') {
      const clientId = generateId();
      clients.set(clientId, {
        id: clientId,
        messages: [],
        lastPing: Date.now(),
        room: null
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ clientId }));
      return;
    }
    
    // 创建房间
    if (path === '/api/create-room') {
      const { clientId } = data;
      const roomCode = generateRoomCode();
      rooms.set(roomCode, {
        code: roomCode,
        players: [clientId],
        ready: new Set(),
        gameState: 'waiting',
        positions: {},
        scores: {},
        burgers: []
      });
      
      const client = clients.get(clientId);
      if (client) client.room = roomCode;
      
      addMessage(clientId, 'roomCreated', { roomCode, role: 'player1' });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ roomCode, role: 'player1' }));
      return;
    }
    
    // 加入房间
    if (path === '/api/join-room') {
      const { clientId, roomCode } = data;
      const room = rooms.get(roomCode);
      
      if (!room) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '房间不存在' }));
        return;
      }
      
      if (room.players.length >= 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '房间已满' }));
        return;
      }
      
      room.players.push(clientId);
      const client = clients.get(clientId);
      if (client) client.room = roomCode;
      
      addMessage(clientId, 'roomJoined', { roomCode, role: 'player2' });
      
      // 通知房主
      const hostId = room.players[0];
      addMessage(hostId, 'playerJoined', { playerCount: room.players.length });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ roomCode, role: 'player2' }));
      return;
    }
    
    // 玩家准备
    if (path === '/api/ready') {
      const { clientId, roomCode } = data;
      const room = rooms.get(roomCode);
      
      if (!room) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '房间不存在' }));
        return;
      }
      
      room.ready.add(clientId);
      
      if (room.ready.size === 2) {
        startGame(roomCode);
      } else {
        room.players.forEach(pid => {
          addMessage(pid, 'playerReady', { readyCount: room.ready.size });
        });
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    // 移动
    if (path === '/api/move') {
      const { clientId, roomCode, direction } = data;
      const room = rooms.get(roomCode);
      
      if (!room || room.gameState !== 'playing') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '游戏未开始' }));
        return;
      }
      
      const currentPos = room.positions[clientId] || 6;
      let newPos = currentPos;
      
      if (direction === 'left') {
        newPos = Math.max(3, currentPos - 1);
      } else if (direction === 'right') {
        newPos = Math.min(16, currentPos + 1);
      }
      
      room.positions[clientId] = newPos;
      
      room.players.forEach(pid => {
        addMessage(pid, 'playerMove', { playerId: clientId, position: newPos });
      });
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    // 吃汉堡
    if (path === '/api/eat') {
      const { clientId, roomCode, burgerId } = data;
      const room = rooms.get(roomCode);
      
      if (!room || room.gameState !== 'playing') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '游戏未开始' }));
        return;
      }
      
      const burgerIndex = room.burgers.findIndex(b => b.id === burgerId);
      if (burgerIndex === -1) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '汉堡不存在' }));
        return;
      }
      
      const burger = room.burgers[burgerIndex];
      const playerPos = room.positions[clientId];
      
      if (Math.abs(burger.x - playerPos) <= 1 && burger.y >= 19 && burger.y <= 21) {
        room.burgers.splice(burgerIndex, 1);
        room.scores[clientId] = (room.scores[clientId] || 0) + 1;
        
        room.players.forEach(pid => {
          addMessage(pid, 'burgerEaten', {
            burgerId,
            playerId: clientId,
            scores: room.scores
          });
        });
      }
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }
    
    // 获取消息（长轮询）
    if (path === '/api/poll') {
      const { clientId } = data;
      const client = clients.get(clientId);
      
      if (!client) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: '客户端不存在' }));
        return;
      }
      
      client.lastPing = Date.now();
      
      // 如果有消息立即返回
      if (client.messages.length > 0) {
        const messages = [...client.messages];
        client.messages = [];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages }));
        return;
      }
      
      // 否则等待最多30秒
      const timeout = setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ messages: [] }));
      }, 30000);
      
      // 存储响应对象以便有新消息时立即返回
      client.pendingResponse = res;
      client.pendingTimeout = timeout;
      return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
  });
}

// 添加消息到客户端
function addMessage(clientId, type, data) {
  const client = clients.get(clientId);
  if (!client) return;
  
  client.messages.push({ type, data, timestamp: Date.now() });
  
  // 如果有等待的响应，立即返回
  if (client.pendingResponse) {
    clearTimeout(client.pendingTimeout);
    const messages = [...client.messages];
    client.messages = [];
    client.pendingResponse.writeHead(200, { 'Content-Type': 'application/json' });
    client.pendingResponse.end(JSON.stringify({ messages }));
    client.pendingResponse = null;
    client.pendingTimeout = null;
  }
}

// 开始游戏
function startGame(roomCode) {
  const room = rooms.get(roomCode);
  if (!room) return;
  
  room.gameState = 'playing';
  room.positions = {
    [room.players[0]]: 6,
    [room.players[1]]: 13
  };
  room.scores = {
    [room.players[0]]: 0,
    [room.players[1]]: 0
  };
  room.burgers = [];
  
  room.players.forEach((pid, i) => {
    addMessage(pid, 'gameStart', {
      role: i === 0 ? 'player1' : 'player2',
      positions: room.positions
    });
  });
  
  // 游戏循环
  let roadOffset = 0;
  room.gameLoop = setInterval(() => {
    if (room.gameState !== 'playing') return;
    
    roadOffset = (roadOffset + 1) % 12;
    
    room.burgers = room.burgers.map(b => ({ ...b, y: b.y + 1 }))
      .filter(b => b.y < 22);
    
    if (Math.random() < 0.3) {
      const x = Math.floor(Math.random() * 14) + 3;
      room.burgers.push({ x, y: 0, id: generateId() });
    }
    
    room.players.forEach(pid => {
      addMessage(pid, 'gameState', {
        burgers: room.burgers,
        roadOffset,
        positions: room.positions,
        scores: room.scores
      });
    });
  }, 350);
}

// 清理不活跃的客户端
setInterval(() => {
  const now = Date.now();
  for (const [clientId, client] of clients) {
    if (now - client.lastPing > 60000) {
      // 断开连接
      if (client.room) {
        const room = rooms.get(client.room);
        if (room) {
          room.players = room.players.filter(id => id !== clientId);
          if (room.players.length === 0) {
            if (room.gameLoop) clearInterval(room.gameLoop);
            rooms.delete(client.room);
          }
        }
      }
      clients.delete(clientId);
    }
  }
}, 30000);

// 创建服务器
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
  handleRequest(req, res);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`HTTP Polling 服务已启动`);
});
