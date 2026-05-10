# 部署到 Vercel 指南

## 方法一：通过 Vercel CLI 部署（推荐）

### 1. 安装 Vercel CLI
```bash
npm i -g vercel
```

### 2. 登录 Vercel
```bash
vercel login
```

### 3. 部署项目
```bash
cd d:\Trae\snake-game-react
vercel
```

按提示操作，选择：
- Set up and deploy? **Y**
- Which scope? 选择你的账号
- Link to existing project? **N**
- What's your project name? 输入项目名称（如 `spicy-burger-battle`）
- In which directory is your code located? **./**

部署完成后会显示网址，如：`https://spicy-burger-battle.vercel.app`

## 方法二：通过 GitHub + Vercel 自动部署

### 1. 创建 GitHub 仓库
- 在 GitHub 创建新仓库（如 `spicy-burger-battle`）
- 上传代码到仓库

### 2. 在 Vercel 导入项目
- 访问 https://vercel.com/new
- 导入你的 GitHub 仓库
- 框架选择 **Vite**
- 点击 Deploy

自动部署完成后会获得网址。

## 方法三：通过 Vercel 网页直接上传

### 1. 准备项目文件
将项目打包成 zip 文件（不包含 node_modules）

### 2. 在 Vercel 上传
- 访问 https://vercel.com/new
- 选择 "Import Git Repository" 下方的 "Upload"
- 上传 zip 文件
- 框架选择 **Vite**
- 点击 Deploy

## 部署配置

项目已包含 `vercel.json` 配置文件：
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

## 分享给微信好友

部署成功后，将获得的网址（如 `https://spicy-burger-battle.vercel.app`）分享给微信好友，他们点击链接即可在手机上玩！

## 游戏操作

- **电脑**：玩家1用 A/D 键，玩家2用 ←/→ 方向键
- **手机**：屏幕下方有蓝色和红色按钮控制两辆车
