import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import OnlineGame from './OnlineGame.jsx'
import './App.css'

// 游戏模式选择组件
function GameSelector() {
  const [mode, setMode] = useState('select') // select, local, online

  if (mode === 'local') {
    return <App />
  }

  if (mode === 'online') {
    return <OnlineGame />
  }

  return (
    <div className="game-container">
      <h1>🌶️ 辣堡对战 🍔</h1>
      <div className="menu-screen">
        <div className="menu-content">
          <h2>选择游戏模式</h2>
          <div className="menu-buttons">
            <button 
              className="menu-btn primary"
              onClick={() => setMode('local')}
            >
              📱 同机双人
              <span className="btn-desc">两个人用同一部手机玩</span>
            </button>
            <button 
              className="menu-btn"
              onClick={() => setMode('online')}
            >
              🌐 联机对战
              <span className="btn-desc">两个人各用手机联机对战</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 添加全局错误处理
window.onerror = function(msg, url, line, col, error) {
  console.error('Global error:', { msg, url, line, col, error })
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #333; font-family: Arial, sans-serif;">
        <h2 style="color: #e74c3c;">游戏加载失败</h2>
        <p>请尝试以下方法：</p>
        <ul style="text-align: left; display: inline-block;">
          <li>刷新页面重试</li>
          <li>清除浏览器缓存</li>
          <li>使用 Chrome 浏览器打开</li>
          <li>检查网络连接</li>
        </ul>
        <p style="color: #666; font-size: 12px; margin-top: 20px;">
          错误信息: ${msg}
        </p>
      </div>
    `
  }
  return false
}

const rootElement = document.getElementById('root')
if (!rootElement) {
  document.body.innerHTML = '<div style="padding: 20px; text-align: center;">页面加载失败，请刷新重试</div>'
} else {
  try {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <GameSelector />
      </React.StrictMode>,
    )
  } catch (error) {
    console.error('Render error:', error)
    rootElement.innerHTML = `
      <div style="padding: 20px; text-align: center;">
        <h2 style="color: #e74c3c;">渲染失败</h2>
        <p>请刷新页面重试</p>
        <p style="color: #666; font-size: 12px;">${error.message}</p>
      </div>
    `
  }
}
