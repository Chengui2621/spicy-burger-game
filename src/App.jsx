import React, { useState, useEffect, useCallback, useRef } from 'react'
import './App.css'

const GRID_WIDTH = 20
const GRID_HEIGHT = 22
const CELL_SIZE = 25
const ROAD_LEFT = 2
const ROAD_RIGHT = 17
const GAME_DURATION = 60 // 游戏时长60秒

// 添加错误边界
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', textAlign: 'center' }}>
          <h2>游戏加载出错</h2>
          <p>请刷新页面重试</p>
          <p style={{ fontSize: '12px', color: '#666' }}>
            {this.state.error?.toString()}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

const SPEED_OPTIONS = [
  { label: '慢速', value: 450 },
  { label: '中速', value: 350 },
  { label: '快速', value: 250 },
  { label: '极速', value: 180 }
]

function App() {
  // 玩家1（蓝色车）- AD键控制
  const [bike1X, setBike1X] = useState(6)
  const [score1, setScore1] = useState(0)

  // 玩家2（红色车）- 方向键控制
  const [bike2X, setBike2X] = useState(13)
  const [score2, setScore2] = useState(0)

  const [burgers, setBurgers] = useState([])
  const [gameOver, setGameOver] = useState(false)
  const [winner, setWinner] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [gameStarted, setGameStarted] = useState(false)
  const [selectedSpeed, setSelectedSpeed] = useState(350)
  const [speed, setSpeed] = useState(350)
  const [roadOffset, setRoadOffset] = useState(0)
  const [eatenEffects, setEatenEffects] = useState([])
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [blockedPositions, setBlockedPositions] = useState(new Set()) // 记录被占据的位置

  const gameLoopRef = useRef(null)
  const timerRef = useRef(null)
  const bike1XRef = useRef(bike1X)
  const bike2XRef = useRef(bike2X)

  useEffect(() => {
    bike1XRef.current = bike1X
  }, [bike1X])

  useEffect(() => {
    bike2XRef.current = bike2X
  }, [bike2X])

  // 更新被占据的位置
  useEffect(() => {
    const positions = new Set()
    positions.add(bike1X)
    positions.add(bike2X)
    setBlockedPositions(positions)
  }, [bike1X, bike2X])

  // 生成汉堡 - 增加密度
  const generateBurger = useCallback(() => {
    const x = Math.floor(Math.random() * (ROAD_RIGHT - ROAD_LEFT - 1)) + ROAD_LEFT + 1
    return { x, y: 0, id: Date.now() + Math.random() }
  }, [])

  // 添加吃到汉堡的动画效果
  const addEatenEffect = useCallback((x, y, player) => {
    const id = Date.now() + Math.random()
    setEatenEffects(prev => [...prev, { id, x, y, player }])
    setTimeout(() => {
      setEatenEffects(prev => prev.filter(effect => effect.id !== id))
    }, 600)
  }, [])

  // 游戏主循环
  const gameLoop = useCallback(() => {
    if (gameOver || isPaused || !gameStarted) return

    // 路面移动效果 - 每3帧移动一次
    setRoadOffset(prev => (prev + 1) % 12)

    // 移动汉堡向下
    setBurgers(currentBurgers => {
      let newBurgers = currentBurgers.map(burger => ({
        ...burger,
        y: burger.y + 1
      })).filter(burger => burger.y < GRID_HEIGHT)

      // 随机生成新汉堡 - 增加生成概率使汉堡更密集
      if (Math.random() < 0.35) {
        newBurgers.push(generateBurger())
        // 有时一次生成两个汉堡
        if (Math.random() < 0.4) {
          newBurgers.push(generateBurger())
        }
      }

      return newBurgers
    })

    // 检查碰撞和吃汉堡
    setBurgers(currentBurgers => {
      const bikeY = GRID_HEIGHT - 2
      const newBurgers = [...currentBurgers]

      // 检查玩家1
      const eatenIndex1 = newBurgers.findIndex(
        burger => burger.x === bike1XRef.current && burger.y === bikeY
      )
      if (eatenIndex1 !== -1) {
        const eatenBurger = newBurgers[eatenIndex1]
        setScore1(s => s + 10)
        addEatenEffect(eatenBurger.x, eatenBurger.y, 1)
        newBurgers.splice(eatenIndex1, 1)
      }

      // 检查玩家2
      const eatenIndex2 = newBurgers.findIndex(
        burger => burger.x === bike2XRef.current && burger.y === bikeY
      )
      if (eatenIndex2 !== -1) {
        const eatenBurger = newBurgers[eatenIndex2]
        setScore2(s => s + 10)
        addEatenEffect(eatenBurger.x, eatenBurger.y, 2)
        newBurgers.splice(eatenIndex2, 1)
      }

      return newBurgers
    })
  }, [gameOver, isPaused, gameStarted, generateBurger, addEatenEffect])

  useEffect(() => {
    gameLoopRef.current = setInterval(gameLoop, speed)
    return () => clearInterval(gameLoopRef.current)
  }, [gameLoop, speed])

  // 计时器
  useEffect(() => {
    if (gameStarted && !gameOver && !isPaused) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            // 时间到，结束游戏
            setGameOver(true)
            if (score1 > score2) {
              setWinner(1)
            } else if (score2 > score1) {
              setWinner(2)
            } else {
              setWinner(0) // 平局
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
    return () => clearInterval(timerRef.current)
  }, [gameStarted, gameOver, isPaused, score1, score2])

  // 键盘控制 - 实现绕行逻辑（被占位置可绕行，不可抢占）
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (gameOver || !gameStarted) return

      switch (e.key) {
        // 玩家1 - AD键
        case 'a':
        case 'A': {
          let newX = Math.max(ROAD_LEFT + 1, bike1XRef.current - 1)
          // 如果目标位置被玩家2占据，尝试继续往同方向移动（绕行）
          if (newX === bike2XRef.current) {
            newX = Math.max(ROAD_LEFT + 1, newX - 1)
            // 如果绕行后还是对方位置，则不能移动
            if (newX === bike2XRef.current) {
              break
            }
          }
          setBike1X(newX)
          break
        }
        case 'd':
        case 'D': {
          let newX = Math.min(ROAD_RIGHT - 1, bike1XRef.current + 1)
          // 如果目标位置被玩家2占据，尝试继续往同方向移动（绕行）
          if (newX === bike2XRef.current) {
            newX = Math.min(ROAD_RIGHT - 1, newX + 1)
            // 如果绕行后还是对方位置，则不能移动
            if (newX === bike2XRef.current) {
              break
            }
          }
          setBike1X(newX)
          break
        }
        // 玩家2 - 方向键
        case 'ArrowLeft': {
          let newX = Math.max(ROAD_LEFT + 1, bike2XRef.current - 1)
          // 如果目标位置被玩家1占据，尝试继续往同方向移动（绕行）
          if (newX === bike1XRef.current) {
            newX = Math.max(ROAD_LEFT + 1, newX - 1)
            // 如果绕行后还是对方位置，则不能移动
            if (newX === bike1XRef.current) {
              break
            }
          }
          setBike2X(newX)
          break
        }
        case 'ArrowRight': {
          let newX = Math.min(ROAD_RIGHT - 1, bike2XRef.current + 1)
          // 如果目标位置被玩家1占据，尝试继续往同方向移动（绕行）
          if (newX === bike1XRef.current) {
            newX = Math.min(ROAD_RIGHT - 1, newX + 1)
            // 如果绕行后还是对方位置，则不能移动
            if (newX === bike1XRef.current) {
              break
            }
          }
          setBike2X(newX)
          break
        }
        case ' ':
          setIsPaused(p => !p)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameOver, gameStarted])

  const startGame = () => {
    setSpeed(selectedSpeed)
    setGameStarted(true)
    setIsPaused(false)
  }

  const resetGame = () => {
    setBike1X(6)
    setBike2X(13)
    setBurgers([])
    setGameOver(false)
    setWinner(null)
    setScore1(0)
    setScore2(0)
    setIsPaused(false)
    setGameStarted(false)
    setTimeLeft(GAME_DURATION)
    setRoadOffset(0)
    setEatenEffects([])
    setBlockedPositions(new Set())
  }

  // 格式化时间显示
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // 渲染游戏画面
  const renderGrid = () => {
    const grid = []
    const bikeY = GRID_HEIGHT - 2

    for (let row = 0; row < GRID_HEIGHT; row++) {
      const cells = []
      for (let col = 0; col < GRID_WIDTH; col++) {
        const isRoad = col >= ROAD_LEFT && col <= ROAD_RIGHT
        const isLaneLine = (col === Math.floor((ROAD_LEFT + ROAD_RIGHT) / 2))
        const isBike1 = col === bike1X && row === bikeY
        const isBike2 = col === bike2X && row === bikeY
        const bothBikes = bike1X === bike2X && col === bike1X && row === bikeY
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

        // 两车在同一位置时的特殊显示
        if (bothBikes) {
          cellClass += ' bike-collision'
        }

        cells.push(
          <div
            key={col}
            className={cellClass}
            style={{
              width: CELL_SIZE,
              height: CELL_SIZE
            }}
          >
            {bothBikes ? (
              <div className="bike-both">
                <span className="bike-icon bike-1">🚴</span>
                <span className="bike-icon bike-2">🚴</span>
              </div>
            ) : (
              <>
                {isBike1 && <span className="bike-icon bike-1">🚴</span>}
                {isBike2 && <span className="bike-icon bike-2">🚴</span>}
              </>
            )}
            {isBurger && <span className="burger-icon">🍔</span>}
          </div>
        )
      }
      grid.push(
        <div key={row} className="row">
          {cells}
        </div>
      )
    }
    return grid
  }

  return (
    <div className="game-container">
      <h1>🌶️ 辣堡对战 🍔</h1>

      {/* 计时器 */}
      {gameStarted && (
        <div className={`timer ${timeLeft <= 10 ? 'timer-warning' : ''}`}>
          ⏱️ {formatTime(timeLeft)}
        </div>
      )}

      <div className="scores">
        <div className="score-box score-1">
          <span className="player-label">玩家1 (A/D键)</span>
          <span className="score-value">{score1}</span>
        </div>
        <div className="vs">VS</div>
        <div className="score-box score-2">
          <span className="player-label">玩家2 (方向键)</span>
          <span className="score-value">{score2}</span>
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

        {/* 吃到汉堡的动画效果 */}
        {eatenEffects.map(effect => (
          <div
            key={effect.id}
            className={`eaten-effect eaten-effect-${effect.player}`}
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

        {/* 游戏开始界面 */}
        {!gameStarted && !gameOver && (
          <div className="start-screen">
            <div className="start-content">
              <h2>🚴 抢汉堡大战 🚴</h2>

              {/* 速度选择 */}
              <div className="speed-selector">
                <p className="speed-label">选择游戏速度：</p>
                <div className="speed-options">
                  {SPEED_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      className={`speed-btn ${selectedSpeed === option.value ? 'active' : ''}`}
                      onClick={() => setSelectedSpeed(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="player-controls">
                <div className="player-control">
                  <span className="bike-emoji">🔵</span>
                  <p>玩家1: A D 键</p>
                </div>
                <div className="player-control">
                  <span className="bike-emoji">🔴</span>
                  <p>玩家2: ← → 方向键</p>
                </div>
              </div>
              <p className="game-rule">同赛道抢汉堡！先到先占位置！</p>
              <p className="game-rule">限时 1 分钟，得分高者获胜！</p>
              <button onClick={startGame}>开始游戏</button>
            </div>
          </div>
        )}

        {gameOver && (
          <div className="game-over">
            <div className="game-over-content">
              <h2>🎉 游戏结束 🎉</h2>
              <p className="winner-text">
                {winner === 0 ? '🤝 平局！' : winner === 1 ? '🔵 玩家1 获胜！' : '🔴 玩家2 获胜！'}
              </p>
              <div className="final-scores">
                <span className="final-score-1">玩家1: {score1}</span>
                <span className="final-score-2">玩家2: {score2}</span>
              </div>
              <button onClick={resetGame}>再来一局</button>
            </div>
          </div>
        )}

        {isPaused && gameStarted && !gameOver && (
          <div className="paused">
            <h2>暂停</h2>
            <p>按空格键继续</p>
          </div>
        )}
      </div>

      {/* 手机触屏控制按钮 */}
      {gameStarted && !gameOver && (
        <div className="mobile-controls">
          {/* 玩家1控制区（左侧） */}
          <div className="mobile-control-group control-left">
            <span className="mobile-player-label">🔵 玩家1</span>
            <div className="mobile-buttons">
              <button
                className="mobile-btn"
                onTouchStart={() => {
                  let newX = Math.max(ROAD_LEFT + 1, bike1X - 1)
                  if (newX === bike2X) {
                    newX = Math.max(ROAD_LEFT + 1, newX - 1)
                    if (newX !== bike2X) setBike1X(newX)
                  } else {
                    setBike1X(newX)
                  }
                }}
                onClick={() => {
                  let newX = Math.max(ROAD_LEFT + 1, bike1X - 1)
                  if (newX === bike2X) {
                    newX = Math.max(ROAD_LEFT + 1, newX - 1)
                    if (newX !== bike2X) setBike1X(newX)
                  } else {
                    setBike1X(newX)
                  }
                }}
              >
                ←
              </button>
              <button
                className="mobile-btn"
                onTouchStart={() => {
                  let newX = Math.min(ROAD_RIGHT - 1, bike1X + 1)
                  if (newX === bike2X) {
                    newX = Math.min(ROAD_RIGHT - 1, newX + 1)
                    if (newX !== bike2X) setBike1X(newX)
                  } else {
                    setBike1X(newX)
                  }
                }}
                onClick={() => {
                  let newX = Math.min(ROAD_RIGHT - 1, bike1X + 1)
                  if (newX === bike2X) {
                    newX = Math.min(ROAD_RIGHT - 1, newX + 1)
                    if (newX !== bike2X) setBike1X(newX)
                  } else {
                    setBike1X(newX)
                  }
                }}
              >
                →
              </button>
            </div>
          </div>

          {/* 暂停按钮（中间） */}
          <button
            className="mobile-pause-btn"
            onTouchStart={() => setIsPaused(p => !p)}
            onClick={() => setIsPaused(p => !p)}
          >
            {isPaused ? '▶️' : '⏸️'}
          </button>

          {/* 玩家2控制区（右侧） */}
          <div className="mobile-control-group control-right">
            <span className="mobile-player-label">🔴 玩家2</span>
            <div className="mobile-buttons">
              <button
                className="mobile-btn"
                onTouchStart={() => {
                  let newX = Math.max(ROAD_LEFT + 1, bike2X - 1)
                  if (newX === bike1X) {
                    newX = Math.max(ROAD_LEFT + 1, newX - 1)
                    if (newX !== bike1X) setBike2X(newX)
                  } else {
                    setBike2X(newX)
                  }
                }}
                onClick={() => {
                  let newX = Math.max(ROAD_LEFT + 1, bike2X - 1)
                  if (newX === bike1X) {
                    newX = Math.max(ROAD_LEFT + 1, newX - 1)
                    if (newX !== bike1X) setBike2X(newX)
                  } else {
                    setBike2X(newX)
                  }
                }}
              >
                ←
              </button>
              <button
                className="mobile-btn"
                onTouchStart={() => {
                  let newX = Math.min(ROAD_RIGHT - 1, bike2X + 1)
                  if (newX === bike1X) {
                    newX = Math.min(ROAD_RIGHT - 1, newX + 1)
                    if (newX !== bike1X) setBike2X(newX)
                  } else {
                    setBike2X(newX)
                  }
                }}
                onClick={() => {
                  let newX = Math.min(ROAD_RIGHT - 1, bike2X + 1)
                  if (newX === bike1X) {
                    newX = Math.min(ROAD_RIGHT - 1, newX + 1)
                    if (newX !== bike1X) setBike2X(newX)
                  } else {
                    setBike2X(newX)
                  }
                }}
              >
                →
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="controls">
        <p>玩家1: A D 键 | 玩家2: ← → 方向键</p>
        <p>手机上使用下方按钮控制</p>
        <p>同一条赛道抢汉堡！先到位置可以挡住对方！</p>
      </div>
    </div>
  )
}

export default App
