// 使用 Socket.io 的服务器 - 对代理更友好
const http = require('http');
const fs = require('fs');
const path = require('path');

// 读取 socket.io 客户端文件
let socketIoClient = '';
try {
  socketIoClient = fs.readFileSync(path.join(__dirname, 'node_modules', 'socket.io', 'client-dist', 'socket.io.js'), 'utf8');
} catch (e) {
  console.log('Socket.io client not found, will serve inline');
}

// 简单的 Socket.io 实现（不依赖外部包）
class SimpleSocketIOServer {
  constructor(server) {
    this.server = server;
    this.clients = new Map();
    this.rooms = new Map();
    
    server.on('request', (req, res) => {
      // 处理 Socket.io 请求
      if (req.url.startsWith('/socket.io/')) {
        this.handleRequest(req, res);
      }
    });
    
    server.on('upgrade', (request, socket, head) => {
      if (request.url.startsWith('/socket.io/')) {
        this.handleUpgrade(request, socket, head);
      }
    });
  }
  
  handleRequest(req, res) {
    // 设置 CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }
    
    // Socket.io 握手
    if (req.url.includes('EIO=')) {
      const sid = this.generateId();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        sid: sid,
        upgrades: ['websocket'],
        pingInterval: 25000,
        pingTimeout: 60000,
        maxPayload: 1000000
      }));
      return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
  }
  
  handleUpgrade(request, socket, head) {
    console.log('Socket.io WebSocket upgrade from:', request.headers['x-forwarded-for'] || socket.remoteAddress);
    
    // 解析 sid
    const url = new URL(request.url, 'http://localhost');
    const sid = url.searchParams.get('sid');
    
    if (!sid) {
      console.error('Missing sid');
      socket.destroy();
      return;
    }
    
    // WebSocket 握手
    const key = request.headers['sec-websocket-key'];
    const acceptKey = this.generateAcceptKey(key);
    
    const response = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      ''
    ].join('\r\n');
    
    socket.write(response);
    
    // 存储客户端
    this.clients.set(sid, { socket, room: null });
    
    // 发送连接确认
    this.sendToSocket(socket, 'connect', { clientId: sid });
    
    socket.on('data', (data) => {
      const message = this.parseMessage(data);
      if (message) {
        this.handleMessage(sid, message);
      }
    });
    
    socket.on('close', () => {
      console.log('Client disconnected:', sid);
      this.handleDisconnect(sid);
    });
    
    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });
    
    socket.setKeepAlive(true, 30000);
  }
  
  generateAcceptKey(key) {
    const crypto = require('crypto');
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + GUID).digest('base64');
  }
  
  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }
  
  parseMessage(data) {
    try {
      const firstByte = data[0];
      const opcode = firstByte & 0x0f;
      
      if (opcode === 0x08) return null;
      if (opcode !== 0x01 && opcode !== 0x02) return null;
      
      const secondByte = data[1];
      let offset = 2;
      let payloadLength = secondByte & 0x7f;
      
      if (payloadLength === 126) {
        payloadLength = data.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        payloadLength = data.readUIntBE(2, 8);
        offset = 10;
      }
      
      const masked = !!(secondByte & 0x80);
      let maskKey;
      
      if (masked) {
        maskKey = data.slice(offset, offset + 4);
        offset += 4;
      }
      
      const payload = data.slice(offset, offset + payloadLength);
      
      if (masked) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }
      
      return JSON.parse(payload.toString());
    } catch (e) {
      console.error('Parse error:', e);
      return null;
    }
  }
  
  sendToSocket(socket, event, data) {
    const message = JSON.stringify({ type: event, data });
    const payload = Buffer.from(message);
    
    let frame;
    if (payload.length < 126) {
      frame = Buffer.allocUnsafe(2);
      frame[0] = 0x81;
      frame[1] = payload.length;
    } else if (payload.length < 65536) {
      frame = Buffer.allocUnsafe(4);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(payload.length, 2);
    } else {
      frame = Buffer.allocUnsafe(10);
      frame[0] = 0x81;
      frame[1] = 127;
      frame.writeUIntBE(payload.length, 2, 8);
    }
    
    socket.write(Buffer.concat([frame, payload]));
  }
  
  handleMessage(clientId, message) {
    console.log('Received:', message.type, 'from', clientId);
    
    switch (message.type) {
      case 'createRoom':
        this.createRoom(clientId);
        break;
      case 'joinRoom':
        this.joinRoom(clientId, message.roomCode);
        break;
      case 'playerReady':
        this.playerReady(clientId, message.roomCode);
        break;
      case 'playerMove':
        this.playerMove(clientId, message.roomCode, message.direction);
        break;
      case 'eatBurger':
        this.eatBurger(clientId, message.roomCode, message.burgerId);
        break;
    }
  }
  
  createRoom(clientId) {
    const roomCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.rooms.set(roomCode, {
      players: [clientId],
      ready: new Set(),
      gameState: 'waiting',
      positions: {},
      scores: {},
      burgers: []
    });
    this.clients.get(clientId).room = roomCode;
    
    const client = this.clients.get(clientId);
    if (client && client.socket) {
      this.sendToSocket(client.socket, 'roomCreated', { roomCode, role: 'player1' });
    }
  }
  
  joinRoom(clientId, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) {
      const client = this.clients.get(clientId);
      if (client && client.socket) {
        this.sendToSocket(client.socket, 'error', { message: '房间不存在' });
      }
      return;
    }
    
    if (room.players.length >= 2) {
      const client = this.clients.get(clientId);
      if (client && client.socket) {
        this.sendToSocket(client.socket, 'error', { message: '房间已满' });
      }
      return;
    }
    
    room.players.push(clientId);
    this.clients.get(clientId).room = roomCode;
    
    const client = this.clients.get(clientId);
    if (client && client.socket) {
      this.sendToSocket(client.socket, 'roomJoined', { roomCode, role: 'player2' });
    }
    
    const hostClient = this.clients.get(room.players[0]);
    if (hostClient && hostClient.socket) {
      this.sendToSocket(hostClient.socket, 'playerJoined', { playerCount: room.players.length });
    }
  }
  
  playerReady(clientId, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    
    room.ready.add(clientId);
    
    if (room.ready.size === 2) {
      this.startGame(roomCode);
    } else {
      room.players.forEach(pid => {
        const client = this.clients.get(pid);
        if (client && client.socket) {
          this.sendToSocket(client.socket, 'playerReady', { readyCount: room.ready.size });
        }
      });
    }
  }
  
  startGame(roomCode) {
    const room = this.rooms.get(roomCode);
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
      const client = this.clients.get(pid);
      if (client && client.socket) {
        this.sendToSocket(client.socket, 'gameStart', {
          role: i === 0 ? 'player1' : 'player2',
          positions: room.positions
        });
      }
    });
    
    let roadOffset = 0;
    room.gameLoop = setInterval(() => {
      if (room.gameState !== 'playing') return;
      
      roadOffset = (roadOffset + 1) % 12;
      
      room.burgers = room.burgers.map(b => ({ ...b, y: b.y + 1 }))
        .filter(b => b.y < 22);
      
      if (Math.random() < 0.3) {
        const x = Math.floor(Math.random() * 14) + 3;
        room.burgers.push({ x, y: 0, id: this.generateId() });
      }
      
      room.players.forEach(pid => {
        const client = this.clients.get(pid);
        if (client && client.socket) {
          this.sendToSocket(client.socket, 'gameState', {
            burgers: room.burgers,
            roadOffset,
            positions: room.positions,
            scores: room.scores
          });
        }
      });
    }, 350);
  }
  
  playerMove(clientId, roomCode, direction) {
    const room = this.rooms.get(roomCode);
    if (!room || room.gameState !== 'playing') return;
    
    const currentPos = room.positions[clientId];
    let newPos = currentPos;
    
    if (direction === 'left') {
      newPos = Math.max(3, currentPos - 1);
    } else if (direction === 'right') {
      newPos = Math.min(16, currentPos + 1);
    }
    
    room.positions[clientId] = newPos;
    
    room.players.forEach(pid => {
      const client = this.clients.get(pid);
      if (client && client.socket) {
        this.sendToSocket(client.socket, 'playerMove', {
          playerId: clientId,
          position: newPos
        });
      }
    });
  }
  
  eatBurger(clientId, roomCode, burgerId) {
    const room = this.rooms.get(roomCode);
    if (!room || room.gameState !== 'playing') return;
    
    const burgerIndex = room.burgers.findIndex(b => b.id === burgerId);
    if (burgerIndex === -1) return;
    
    const burger = room.burgers[burgerIndex];
    const playerPos = room.positions[clientId];
    
    if (Math.abs(burger.x - playerPos) <= 1 && burger.y >= 19 && burger.y <= 21) {
      room.burgers.splice(burgerIndex, 1);
      room.scores[clientId] = (room.scores[clientId] || 0) + 1;
      
      room.players.forEach(pid => {
        const client = this.clients.get(pid);
        if (client && client.socket) {
          this.sendToSocket(client.socket, 'burgerEaten', {
            burgerId,
            playerId: clientId,
            scores: room.scores
          });
        }
      });
    }
  }
  
  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    if (client.room) {
      const room = this.rooms.get(client.room);
      if (room) {
        room.players = room.players.filter(id => id !== clientId);
        if (room.players.length === 0) {
          if (room.gameLoop) clearInterval(room.gameLoop);
          this.rooms.delete(client.room);
        } else {
          room.players.forEach(pid => {
            const otherClient = this.clients.get(pid);
            if (otherClient && otherClient.socket) {
              this.sendToSocket(otherClient.socket, 'playerLeft', { playerId: clientId });
            }
          });
        }
      }
    }
    
    this.clients.delete(clientId);
  }
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url} from ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ 
      status: 'ok', 
      message: '辣堡对战服务器运行中 (Socket.io)',
      timestamp: new Date().toISOString(),
      websocket: true,
      port: process.env.PORT || 3001
    }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not Found');
});

// 启动 Socket.io 服务器
new SimpleSocketIOServer(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`Socket.io 服务已启动`);
});
