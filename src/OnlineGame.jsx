import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const GRID_WIDTH = 20
const GRID_HEIGHT = 22
const CELL_SIZE = 25
const ROAD_LEFT = 2
const ROAD_RIGHT = 17
const GAME_DURATION = 60

// 生产环境使用 Railway 地址
const SERVER_URL = 'wss://spicy-burger-game-production.up.railway.app'

function OnlineGame() {
  const [connected, setConnected] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [inputCode, setInputCode] = useState('')
  const [playerRole, setPlayerRole] = useState(null)
  const [gameState, setGameState] = useState('menu')
  const [error, setError] = useState('')
  
  const [myPosition, setMyPosition] = useState(6)
  const [opponentPosition, setOpponentPosition] = useState(13)
  const [myScore, setMyScore] = useState(0)
  const [opponentScore, setOpponentScore] = useState(0)
  const [burgers, setBurgers] = useState([])
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [roadOffset, setRoadOffset] = useState(0)
  const [winner, setWinner] = useState(null)
  const [eatenEffects, setEatenEffects] = useState([])
  
  const wsRef = useRef(null)
  const myIdRef = useRef(null)
  const myPositionRef = useRef(myPosition)
  const gameLoopRef = useRef(null)
  const timerRef = useRef(null)
  
  useEffect(() => {
    myPositionRef.current = myPosition
  }, [myPosition])

  // 连接 WebSocket
  useEffect(() => {
    const connect = () => {
      try {
        const ws = new WebSocket(SERVER_URL)
        
        ws.onopen = () => {
          console.log('WebSocket 连接成功')
          setConnected(true)
          setError('')
        }
        
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data)
          handleMessage(data)
        }
        
        ws.onclose = () => {
          console.log('WebSocket 连接关闭')
          setConnected(false)
          setError('连接已断开')
        }
        
        ws.onerror = (err) => {
          console.error('WebSocket 错误:', err)
          setError('连接错误')
          setConnected(false)
        }
        
        wsRef.current = ws
      } catch (e) {
        console.error('连接失败:', e)
        setError('无法连接到服务器')
      }
    }
    
    connect()
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // 发送消息
  const send = (data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }

  // 处理消息
  const handleMessage = (data) => {
    switch (data.type) {
      case 'connected':
        myIdRef.current = data.clientId
        break
        
      case 'roomCreated':
        setRoomCode(data.roomCode)
        setPlayerRole(data.role)
        setGameState('waiting')
        setError('')
        break
        
      case 'roomJoined':
        setRoomCode(data.roomCode)
        setPlayerRole(data.role)
        setGameState('waiting')
        setError('')
        break
        
      case 'playerJoined':
        console.log('玩家加入，当前人数:', data.playerCount)
        break
        
      case 'playerReady':
        console.log('准备人数:', data.readyCount)
        break
        
      case 'gameStart':
        startLocalGame(data)
        break
        
      case 'gameState':
        updateGameState(data)
        break
        
      case 'positionUpdate':
        updatePositions(data.positions)
        break
        
      case 'burgerEaten':
        handleBurgerEaten(data)
        break
        
      case 'error':
        setError(data.message)
        break
        
      case 'playerDisconnected':
        setError('对方已断开连接')
        setGameState('menu')
        break
    }
  }

  // 开始本地游戏
  const startLocalGame = (data) => {
    setPlayerRole(data.role)
    setGameState('playing')
    
    const positions = data.positions || {}
    const myId = myIdRef.current
    const otherId = Object.keys(positions).find(id => id !== myId)
    
    setMyPosition(positions[myId] || 6)
    setOpponentPosition(positions[otherId] || 13)
    setMyScore(0)
    setOpponentScore(0)
    setBurgers([])
    setTimeLeft(GAME_DURATION)
    setRoadOffset(0)
    setWinner(null)
    
    // 本地计时器
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          endGame()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // 更新游戏状态
  const updateGameState = (data) => {
    setBurgers(data.burgers || [])
    setRoadOffset(data.roadOffset || 0)
    
    if (data.scores) {
      const myId = myIdRef.current
      const otherId = Object.keys(data.scores).find(id => id !== myId)
      setMyScore(data.scores[myId] || 0)
      setOpponentScore(data.scores[otherId] || 0)
    }
    
    if (data.positions) {
      updatePositions(data.positions)
    }
  }

  // 更新位置
  const updatePositions = (positions) => {
    const myId = myIdRef.current
    const otherId = Object.keys(positions).find(id => id !== myId)
    
    if (positions[myId] !== undefined) {
      setMyPosition(positions[myId])
    }
    if (positions[otherId] !== undefined) {
      setOpponentPosition(positions[otherId])
    }
  }

  // 处理吃汉堡
  const handleBurgerEaten = (data) => {
    const myId = myIdRef.current
    const isMe = data.player === myId
    
    // 添加动画效果
    const id = Date.now() + Math.random()
    setEatenEffects(prev => [...prev, { 
      id, 
      x: data.burger.x, 
      y: data.burger.y, 
      player: isMe ? 'me' : 'opponent'
    }])
    
    setTimeout(() => {
      setEatenEffects(prev => prev.filter(effect => effect.id !== id))
    }, 600)
    
    // 更新分数
    if (data.scores) {
      const otherId = Object.keys(data.scores).find(id => id !== myId)
      setMyScore(data.scores[myId] || 0)
      setOpponentScore(data.scores[otherId] || 0)
    }
  }

  // 结束游戏
  const endGame = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    setGameState('ended')
    
    if (myScore > opponentScore) {
      setWinner('me')
    } else if (opponentScore > myScore) {
      setWinner('opponent')
    } else {
      setWinner('tie')
    }
  }

  // 创建房间
  const createRoom = () => {
    if (!connected) {
      setError('未连接到服务器')
      return
    }
    send({ type: 'createRoom' })
  }

  // 加入房间
  const joinRoom = () => {
    if (!connected) {
      setError('未连接到服务器')
      return
    }
    if (!inputCode.trim()) {
      setError('请输入房间号')
      return
    }
    send({ type: 'joinRoom', roomCode: inputCode.trim() })
  }

  // 准备
  const ready = () => {
    if (!roomCode) return
    send({ type: 'ready', roomCode })
  }

  // 移动
  const move = useCallback((direction) => {
    if (!roomCode || gameState !== 'playing') return
    send({ type: 'move', roomCode, direction })
  }, [roomCode, gameState])

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          move('left')
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          move('right')
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, move])

  // 渲染游戏画面
  const renderGrid = () => {
    const grid = []
    const bikeY = GRID_HEIGHT - 2
    
    for (let row = 0; row < GRID_HEIGHT; row++) {
      const cells = []
      for (let col = 0; col < GRID_WIDTH; col++) {
        const isRoad = col >= ROAD_LEFT && col <= ROAD_RIGHT
        const isLaneLine = (col === Math.floor((ROAD_LEFT + ROAD_RIGHT) / 2))
        const isMyBike = col === myPosition && row === bikeY
        const isOpponentBike = col === opponentPosition && row === bikeY
        const bothBikes = myPosition === opponentPosition && col === myPosition && row === bikeY
        const burger = burgers.find(b => b.x === col && b.y === row)
        const isBurger = !!burger
        const laneLineOffset = Math.floor(roadOffset / 3)

        let cellClass = 'cell'
        if (isRoad) {
          if (isLaneLine && (row + laneLineOffset) % 4 < 2) {
            cellClass += ' lane-line'
          } else {
            cellClass += ' road'
          }
        } else {
          cellClass += ' grass'
        }

        if (bothBikes) {
          cellClass += ' bike-collision'
        }

        cells.push(
          <div
            key={col}
            className={cellClass}
            style={{ width: CELL_SIZE, height: CELL_SIZE }}
          >
            {bothBikes ? (
              <div className="bike-both">
                <span className="bike-icon bike-1">🚴</span>
                <span className="bike-icon bike-2">🚴</span>
              </div>
            ) : (
              <>
                {isMyBike && (
                  <span className={`bike-icon ${playerRole === 'player1' ? 'bike-1' : 'bike-2'}`}>
                    🚴
                  </span>
                )}
                {isOpponentBike && (
                  <span className={`bike-icon ${playerRole === 'player1' ? 'bike-2' : 'bike-1'}`}>
                    🚴
                  </span>
                )}
              </>
            )}
            {isBurger && <span className="burger-icon">🍔</span>}
          </div>
        )
      }
      grid.push(<div key={row} className="row">{cells}</div>)
    }
    return grid
  }

  // 格式化时间
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 返回主菜单
  const backToMenu = () => {
    setGameState('menu')
    setRoomCode('')
    setPlayerRole(null)
    setInputCode('')
    setError('')
    setWinner(null)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  return (
    <div className="game-container">
      <h1>🌶️ 辣堡对战 - 联机版 🍔</h1>
      
      {!connected && (
        <div className="connection-status connecting">
          正在连接服务器...
        </div>
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {gameState === 'menu' && (
        <div className="menu-screen">
          <div className="menu-content">
            <h2>选择游戏模式</h2>
            
            <div className="menu-buttons">
              <button 
                className="menu-btn primary"
                onClick={createRoom}
                disabled={!connected}
              >
                创建房间
              </button>
              
              <div className="join-room-section">
                <input
                  type="text"
                  placeholder="输入6位房间号"
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  maxLength={6}
                  className="room-input"
                />
                <button 
                  className="menu-btn"
                  onClick={joinRoom}
                  disabled={!connected}
                >
                  加入房间
                </button>
              </div>
            </div>
            
            <p className="menu-tip">
              {connected ? '已连接到服务器' : '正在连接服务器...'}
            </p>
          </div>
        </div>
      )}

      {gameState === 'waiting' && (
        <div className="waiting-screen">
          <div className="waiting-content">
            <h2>等待玩家加入</h2>
            <div className="room-code-display">
              <span className="code-label">房间号</span>
              <span className="code-value">{roomCode}</span>
            </div>
            <p className="waiting-tip">
              告诉好友房间号，让他们加入游戏
            </p>
            <button className="ready-btn" onClick={ready}>
              我准备好了
            </button>
            <button className="back-btn" onClick={backToMenu}>
              返回
            </button>
          </div>
        </div>
      )}

      {(gameState === 'playing' || gameState === 'ended') && (
        <>
          <div className={`timer ${timeLeft <= 10 ? 'timer-warning' : ''}`}>
            ⏱️ {formatTime(timeLeft)}
          </div>

          <div className="scores">
            <div className={`score-box ${playerRole === 'player1' ? 'score-1' : 'score-2'}`}>
              <span className="player-label">我 ({playerRole === 'player1' ? '蓝车' : '红车'})</span>
              <span className="score-value">{myScore}</span>
            </div>
            <div className="vs">VS</div>
            <div className={`score-box ${playerRole === 'player1' ? 'score-2' : 'score-1'}`}>
              <span className="player-label">对手</span>
              <span className="score-value">{opponentScore}</span>
            </div>
          </div>

          <div
            className="game-board"
            style={{
              width: GRID_WIDTH * CELL_SIZE,
              height: GRID_HEIGHT * CELL_SIZE
            }}
          >
            {renderGrid()}

            {eatenEffects.map(effect => (
              <div
                key={effect.id}
                className={`eaten-effect eaten-effect-${effect.player === 'me' ? '1' : '2'}`}
                style={{
                  left: effect.x * CELL_SIZE,
                  top: effect.y * CELL_SIZE,
                  width: CELL_SIZE,
                  height: CELL_SIZE
                }}
              >
                <span className="eaten-emoji">😋</span>
                <span className="score-popup">+10</span>
              </div>
            ))}

            {gameState === 'ended' && (
              <div className="game-over">
                <div className="game-over-content">
                  <h2>🎉 游戏结束 🎉</h2>
                  <p className="winner-text">
                    {winner === 'tie' 
                      ? '🤝 平局！' 
                      : winner === 'me' 
                        ? '🏆 你赢了！' 
                        : '😢 你输了'}
                  </p>
                  <div className="final-scores">
                    <span>你的得分: {myScore}</span>
                    <span>对手得分: {opponentScore}</span>
                  </div>
                  <button onClick={backToMenu}>再来一局</button>
                </div>
              </div>
            )}
          </div>

          {gameState === 'playing' && (
            <div className="mobile-controls single-player">
              <div className="mobile-control-group">
                <span className="mobile-player-label">
                  {playerRole === 'player1' ? '🔵 蓝车 (你)' : '🔴 红车 (你)'}
                </span>
                <div className="mobile-buttons">
                  <button
                    className="mobile-btn"
                    onTouchStart={() => move('left')}
                    onClick={() => move('left')}
                  >
                    ←
                  </button>
                  <button
                    className="mobile-btn"
                    onTouchStart={() => move('right')}
                    onClick={() => move('right')}
                  >
                    →
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="controls">
            <p>使用 ← → 方向键 或 A/D 键控制</p>
            <p>手机上点击下方按钮</p>
          </div>
        </>
      )}
    </div>
  )
}

export default OnlineGame
