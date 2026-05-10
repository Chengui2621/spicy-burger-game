// 简化版服务器 - 不依赖外部包
const http = require('http');
const crypto = require('crypto');

// 简单的 WebSocket 实现
class SimpleWebSocketServer {
  constructor(server) {
    this.server = server;
    this.clients = new Map();
    this.rooms = new Map();
    
    server.on('upgrade', (request, socket, head) => {
      this.handleUpgrade(request, socket, head);
    });
  }

  handleUpgrade(request, socket, head) {
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
    
    const clientId = this.generateId();
    this.clients.set(clientId, { socket, room: null });
    
    socket.on('data', (data) => {
      const message = this.parseMessage(data);
      if (message) {
        this.handleMessage(clientId, message);
      }
    });
    
    socket.on('close', () => {
      this.handleDisconnect(clientId);
    });
    
    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });

    // 发送连接成功消息
    this.send(clientId, { type: 'connected', clientId });
  }

  generateAcceptKey(key) {
    const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
    return crypto.createHash('sha1').update(key + GUID).digest('base64');
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9);
  }

  generateRoomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  parseMessage(data) {
    try {
      const firstByte = data[0];
      const opcode = firstByte & 0x0f;
      
      if (opcode === 0x08) return null; // Close frame
      if (opcode !== 0x01 && opcode !== 0x02) return null; // Not text or binary
      
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
      
      return JSON.parse(payload.toString('utf8'));
    } catch (e) {
      console.error('Parse error:', e);
      return null;
    }
  }

  send(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || client.socket.destroyed) return;
    
    const message = JSON.stringify(data);
    const payload = Buffer.from(message, 'utf8');
    const length = payload.length;
    
    let frame;
    if (length < 126) {
      frame = Buffer.allocUnsafe(2);
      frame[0] = 0x81; // Text frame, FIN=1
      frame[1] = length;
    } else if (length < 65536) {
      frame = Buffer.allocUnsafe(4);
      frame[0] = 0x81;
      frame[1] = 126;
      frame.writeUInt16BE(length, 2);
    } else {
      frame = Buffer.allocUnsafe(10);
      frame[0] = 0x81;
      frame[1] = 127;
      frame.writeUIntBE(length, 2, 8);
    }
    
    client.socket.write(Buffer.concat([frame, payload]));
  }

  broadcast(roomCode, data, excludeClientId = null) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    
    for (const clientId of room.players) {
      if (clientId !== excludeClientId) {
        this.send(clientId, data);
      }
    }
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'createRoom':
        this.createRoom(clientId);
        break;
      case 'joinRoom':
        this.joinRoom(clientId, message.roomCode);
        break;
      case 'ready':
        this.playerReady(clientId, message.roomCode);
        break;
      case 'move':
        this.playerMove(clientId, message.roomCode, message.direction);
        break;
    }
  }

  createRoom(clientId) {
    const roomCode = this.generateRoomCode();
    const room = {
      code: roomCode,
      players: [clientId],
      ready: new Set(),
      gameState: 'waiting',
      positions: {},
      scores: {},
      burgers: [],
      gameLoop: null
    };
    
    this.rooms.set(roomCode, room);
    this.clients.get(clientId).room = roomCode;
    
    this.send(clientId, { 
      type: 'roomCreated', 
      roomCode, 
      role: 'player1' 
    });
  }

  joinRoom(clientId, roomCode) {
    const room = this.rooms.get(roomCode);
    
    if (!room) {
      this.send(clientId, { type: 'error', message: '房间不存在' });
      return;
    }
    
    if (room.players.length >= 2) {
      this.send(clientId, { type: 'error', message: '房间已满' });
      return;
    }
    
    room.players.push(clientId);
    this.clients.get(clientId).room = roomCode;
    
    this.send(clientId, { 
      type: 'roomJoined', 
      roomCode, 
      role: 'player2' 
    });
    
    // 通知房主
    this.send(room.players[0], { 
      type: 'playerJoined', 
      playerCount: room.players.length 
    });
  }

  playerReady(clientId, roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    
    room.ready.add(clientId);
    
    if (room.ready.size === 2) {
      this.startGame(roomCode);
    } else {
      this.broadcast(roomCode, { 
        type: 'playerReady', 
        readyCount: room.ready.size 
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
    
    // 通知所有玩家游戏开始
    for (let i = 0; i < room.players.length; i++) {
      this.send(room.players[i], {
        type: 'gameStart',
        role: i === 0 ? 'player1' : 'player2',
        positions: room.positions
      });
    }
    
    // 游戏循环
    let roadOffset = 0;
    room.gameLoop = setInterval(() => {
      if (room.gameState !== 'playing') return;
      
      roadOffset = (roadOffset + 1) % 12;
      
      // 移动汉堡
      room.burgers = room.burgers.map(b => ({ ...b, y: b.y + 1 }))
        .filter(b => b.y < 22);
      
      // 生成汉堡
      if (Math.random() < 0.3) {
        const x = Math.floor(Math.random() * 14) + 3;
        room.burgers.push({ x, y: 0, id: this.generateId() });
      }
      
      // 广播状态
      for (const playerId of room.players) {
        this.send(playerId, {
          type: 'gameState',
          burgers: room.burgers,
          roadOffset,
          positions: room.positions,
          scores: room.scores
        });
      }
    }, 350);
  }

  playerMove(clientId, roomCode, direction) {
    const room = this.rooms.get(roomCode);
    if (!room || room.gameState !== 'playing') return;
    
    const currentPos = room.positions[clientId];
    let newPos = currentPos;
    
    if (direction === 'left') {
      newPos = Math.max(3, currentPos - 1);
    } else {
      newPos = Math.min(16, currentPos + 1);
    }
    
    // 检查碰撞
    const otherPlayer = room.players.find(p => p !== clientId);
    if (newPos === room.positions[otherPlayer]) {
      // 尝试绕行
      if (direction === 'left') {
        newPos = Math.max(3, newPos - 1);
      } else {
        newPos = Math.min(16, newPos + 1);
      }
      if (newPos === room.positions[otherPlayer]) {
        newPos = currentPos;
      }
    }
    
    if (newPos !== currentPos) {
      room.positions[clientId] = newPos;
      
      // 广播位置更新
      for (const playerId of room.players) {
        this.send(playerId, {
          type: 'positionUpdate',
          positions: room.positions
        });
      }
      
      // 检查吃汉堡
      this.checkBurgerCollision(room, clientId);
    }
  }

  checkBurgerCollision(room, clientId) {
    const bikeY = 20;
    const bikeX = room.positions[clientId];
    
    const eatenIndex = room.burgers.findIndex(
      b => b.x === bikeX && b.y === bikeY
    );
    
    if (eatenIndex !== -1) {
      const burger = room.burgers[eatenIndex];
      room.burgers.splice(eatenIndex, 1);
      room.scores[clientId] = (room.scores[clientId] || 0) + 10;
      
      for (const playerId of room.players) {
        this.send(playerId, {
          type: 'burgerEaten',
          player: clientId,
          burger,
          scores: room.scores
        });
      }
    }
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client && client.room) {
      const room = this.rooms.get(client.room);
      if (room) {
        // 通知其他玩家
        const otherPlayer = room.players.find(p => p !== clientId);
        if (otherPlayer) {
          this.send(otherPlayer, { type: 'playerDisconnected' });
        }
        
        // 清理房间
        if (room.gameLoop) {
          clearInterval(room.gameLoop);
        }
        this.rooms.delete(client.room);
      }
    }
    this.clients.delete(clientId);
  }
}

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // 设置 CORS 头
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
      message: '辣堡对战服务器运行中',
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  res.writeHead(404);
  res.end('Not Found');
});

// 启动 WebSocket 服务器
new SimpleWebSocketServer(server);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
  console.log(`WebSocket 服务已启动`);
});
