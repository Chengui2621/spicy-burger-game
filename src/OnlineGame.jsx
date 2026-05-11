import { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const GRID_WIDTH = 20
const GRID_HEIGHT = 22
const CELL_SIZE = 25
const ROAD_LEFT = 2
const ROAD_RIGHT = 17
const GAME_DURATION = 60

// 生产环境使用 Railway 地址
const API_URL = 'https://spicy-burger-game-production.up.railway.app'

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
  
  const clientIdRef = useRef(null)
  const myPositionRef = useRef(myPosition)
  const gameLoopRef = useRef(null)
  const timerRef = useRef(null)
  const pollingRef = useRef(null)
  
  useEffect(() => {
    myPositionRef.current = myPosition
  }, [myPosition])

  // 注册客户端
  useEffect(() => {
    const register = async () => {
      try {
        const res = await fetch(`${API_URL}/api/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
        const data = await res.json()
        clientIdRef.current = data.clientId
        setConnected(true)
        setError('')
        
        // 开始轮询
        startPolling()
      } catch (e) {
        console.error('注册失败:', e)
        setError('无法连接到服务器')
      }
    }
    
    register()
    
    return () => {
      if (pollingRef.current) {
        clearTimeout(pollingRef.current)
      }
      if (gameLoopRef.current) {
        clearInterval(gameLoopRef.current)
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // 长轮询获取消息
  const startPolling = async () => {
    if (!clientIdRef.current) return
    
    try {
      const res = await fetch(`${API_URL}/api/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: clientIdRef.current })
      })
      const data = await res.json()
      
      // 处理消息
      if (data.messages) {
        data.messages.forEach(msg => handleMessage(msg.type, msg.data))
      }
    } catch (e) {
      console.error('轮询错误:', e)
    }
    
    // 继续轮询
    pollingRef.current = setTimeout(startPolling, 100)
  }

  // 发送请求
  const apiCall = async (endpoint, body = {}) => {
    if (!clientIdRef.current) return null
    
    try {
      const res = await fetch(`${API_URL}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, clientId: clientIdRef.current, roomCode })
      })
      return await res.json()
    } catch (e) {
      console.error('API调用失败:', e)
      return null
    }
  }

  // 处理消息
  const handleMessage = (type, data) => {
    switch (type) {
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
        setPlayerRole(data.role)
        if (data.role === 'player1') {
          setMyPosition(data.positions[data.playerId] || 6)
          setOpponentPosition(data.positions[data.opponentId] || 13)
        } else {
          setMyPosition(data.positions[data.playerId] || 13)
          setOpponentPosition(data.positions[data.opponentId] || 6)
        }
        setGameState('playing')
        setError('')
        startTimer()
        break
        
      case 'gameState':
        setBurgers(data.burgers)
        setRoadOffset(data.roadOffset)
        setMyScore(data.scores[clientIdRef.current] || 0)
        const opponentId = Object.keys(data.scores).find(id => id !== clientIdRef.current)
        if (opponentId) {
          setOpponentScore(data.scores[opponentId] || 0)
          setOpponentPosition(data.positions[opponentId] || 13)
        }
        break
        
      case 'playerMove':
        if (data.playerId !== clientIdRef.current) {
          setOpponentPosition(data.position)
        }
        break
        
      case 'burgerEaten':
        if (data.playerId === clientIdRef.current) {
          setMyScore(data.scores[data.playerId])
        } else {
          setOpponentScore(data.scores[data.playerId])
        }
        
        const eatenBurger = burgers.find(b => b.id === data.burgerId)
        if (eatenBurger) {
          const effectId = Date.now()
          setEatenEffects(prev => [...prev, { id: effectId, x: eatenBurger.x, y: eatenBurger.y }])
          setTimeout(() => {
            setEatenEffects(prev => prev.filter(e => e.id !== effectId))
          }, 500)
        }
        break
        
      case 'playerLeft':
        setError('对方已断开连接')
        setGameState('menu')
        break
    }
  }

  // 创建房间
  const createRoom = async () => {
    const data = await apiCall('create-room')
    if (data && data.error) {
      setError(data.error)
    }
  }

  // 加入房间
  const joinRoom = async () => {
    if (!inputCode || inputCode.length !== 6) {
      setError('请输入6位房间号')
      return
    }
    const data = await apiCall('join-room', { roomCode: inputCode })
    if (data && data.error) {
      setError(data.error)
    }
  }

  // 准备
  const playerReady = async () => {
    await apiCall('ready')
  }

  // 移动
  const moveBike = async (direction) => {
    if (gameState !== 'playing') return
    
    const newPos = direction === 'left' 
      ? Math.max(3, myPositionRef.current - 1)
      : Math.min(16, myPositionRef.current + 1)
    
    setMyPosition(newPos)
    await apiCall('move', { direction })
    
    // 检查吃汉堡
    checkBurgerCollision(newPos)
  }

  // 检查汉堡碰撞
  const checkBurgerCollision = async (playerPos) => {
    const burger = burgers.find(b => 
      Math.abs(b.x - playerPos) <= 1 && b.y >= 19 && b.y <= 21
    )
    
    if (burger) {
      await apiCall('eat', { burgerId: burger.id })
    }
  }

  // 键盘控制
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameState !== 'playing') return
      
      if (playerRole === 'player1') {
        if (e.key === 'a' || e.key === 'A') moveBike('left')
        if (e.key === 'd' || e.key === 'D') moveBike('right')
      } else {
        if (e.key === 'ArrowLeft') moveBike('left')
        if (e.key === 'ArrowRight') moveBike('right')
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState, playerRole, burgers])

  // 计时器
  const startTimer = () => {
    setTimeLeft(GAME_DURATION)
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          endGame()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  // 游戏结束
  const endGame = () => {
    setGameState('gameover')
    if (myScore > opponentScore) {
      setWinner('你赢了！')
    } else if (myScore < opponentScore) {
      setWinner('对方赢了！')
    } else {
      setWinner('平局！')
    }
  }

  // 重新开始
  const restartGame = () => {
    setGameState('menu')
    setRoomCode('')
    setInputCode('')
    setPlayerRole(null)
    setMyScore(0)
    setOpponentScore(0)
    setBurgers([])
    setWinner(null)
    setError('')
  }

  // 渲染游戏画面
  const renderGame = () => {
    const cells = []
    
    // 渲染路面
    for (let y = 0; y < GRID_HEIGHT; y++) {
      for (let x = ROAD_LEFT; x <= ROAD_RIGHT; x++) {
        const isLane = x === 9 || x === 10
        const isMovingLine = isLane && (y + roadOffset) % 6 < 3
        
        cells.push(
          <div
            key={`road-${x}-${y}`}
            className={`cell ${isLane ? 'lane' : ''} ${isMovingLine ? 'road-line' : ''}`}
            style={{
              left: x * CELL_SIZE,
              top: y * CELL_SIZE,
              width: CELL_SIZE,
              height: CELL_SIZE
            }}
          />
        )
      }
    }
    
    // 渲染汉堡
    burgers.forEach(burger => {
      cells.push(
        <div
          key={`burger-${burger.id}`}
          className="burger"
          style={{
            left: burger.x * CELL_SIZE,
            top: burger.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE
          }}
        >
          🍔
        </div>
      )
    })
    
    // 渲染吃掉的特效
    eatenEffects.forEach(effect => {
      cells.push(
        <div
          key={`effect-${effect.id}`}
          className="eaten-effect"
          style={{
            left: effect.x * CELL_SIZE,
            top: effect.y * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE
          }}
        >
          ✨
        </div>
      )
    })
    
    // 渲染我的车
    cells.push(
      <div
        key="my-bike"
        className={`bike ${playerRole === 'player1' ? 'player1' : 'player2'}`}
        style={{
          left: myPosition * CELL_SIZE,
          top: (GRID_HEIGHT - 3) * CELL_SIZE,
          width: CELL_SIZE,
          height: CELL_SIZE * 2
        }}
      >
        🚴
      </div>
    )
    
    // 渲染对方的车
    cells.push(
      <div
        key="opponent-bike"
        className={`bike opponent ${playerRole === 'player1' ? 'player2' : 'player1'}`}
        style={{
          left: opponentPosition * CELL_SIZE,
          top: (GRID_HEIGHT - 3) * CELL_SIZE,
          width: CELL_SIZE,
          height: CELL_SIZE * 2
        }}
      >
        🚴
      </div>
    )
    
    return cells
  }

  // 菜单界面
  if (gameState === 'menu') {
    return (
      <div className="game-container">
        <h1>🌶️ 辣堡对战 🍔</h1>
        <div className="menu-screen">
          <div className="menu-content">
            <h2>联机对战</h2>
            {!connected ? (
              <div className="loading">正在连接服务器...</div>
            ) : (
              <>
                <div className="room-actions">
                  <button className="menu-btn primary" onClick={createRoom}>
                    创建房间
                  </button>
                  <div className="join-room">
                    <input
                      type="text"
                      placeholder="输入6位房间号"
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      maxLength={6}
                    />
                    <button className="menu-btn" onClick={joinRoom}>
                      加入房间
                    </button>
                  </div>
                </div>
                {error && <div className="error-message">{error}</div>}
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 等待界面
  if (gameState === 'waiting') {
    return (
      <div className="game-container">
        <h1>🌶️ 辣堡对战 🍔</h1>
        <div className="waiting-screen">
          <div className="room-info">
            <h2>房间号</h2>
            <div className="room-code">{roomCode}</div>
            <p>你是 {playerRole === 'player1' ? '玩家1 (左边)' : '玩家2 (右边)'}</p>
            <p className="waiting-text">等待其他玩家...</p>
            <button className="menu-btn primary" onClick={playerReady}>
              我准备好了
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </div>
      </div>
    )
  }

  // 游戏结束
  if (gameState === 'gameover') {
    return (
      <div className="game-container">
        <h1>🌶️ 辣堡对战 🍔</h1>
        <div className="game-over-screen">
          <h2>游戏结束</h2>
          <div className="winner-text">{winner}</div>
          <div className="final-scores">
            <div>你的得分: {myScore}</div>
            <div>对方得分: {opponentScore}</div>
          </div>
          <button className="menu-btn primary" onClick={restartGame}>
            返回菜单
          </button>
        </div>
      </div>
    )
  }

  // 游戏界面
  return (
    <div className="game-container">
      <h1>🌶️ 辣堡对战 🍔</h1>
      <div className="game-info">
        <div className="score">你: {myScore}</div>
        <div className="timer">{Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}</div>
        <div className="score">对方: {opponentScore}</div>
      </div>
      <div 
        className="game-board online-game"
        style={{
          width: GRID_WIDTH * CELL_SIZE,
          height: GRID_HEIGHT * CELL_SIZE
        }}
      >
        {renderGame()}
      </div>
      <div className="controls online-controls">
        {playerRole === 'player1' ? (
          <>
            <button 
              className="control-btn"
              onTouchStart={() => moveBike('left')}
              onClick={() => moveBike('left')}
            >
              ← A
            </button>
            <button 
              className="control-btn"
              onTouchStart={() => moveBike('right')}
              onClick={() => moveBike('right')}
            >
              D →
            </button>
          </>
        ) : (
          <>
            <button 
              className="control-btn"
              onTouchStart={() => moveBike('left')}
              onClick={() => moveBike('left')}
            >
              ← 左
            </button>
            <button 
              className="control-btn"
              onTouchStart={() => moveBike('right')}
              onClick={() => moveBike('right')}
            >
              右 →
            </button>
          </>
        )}
      </div>
      {error && <div className="error-message">{error}</div>}
    </div>
  )
}

export default OnlineGame
