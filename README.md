# AI 麻将助手 Prototype

手机优先的静态 PWA 原型。站点由 GitHub Actions 将 `dist/` 发布到 GitHub Pages。

## iPhone 使用

1. 在 iPhone 的 Safari 中打开 GitHub Pages 地址。
2. 点“分享”，选择“添加到主屏幕”。
3. 从主屏幕图标打开后，按设置向导允许摄像头与麦克风，并测试播报。

站点界面与 Mock 牌局在首次打开并缓存后可以离线使用。浏览器语音识别服务是否能离线工作取决于 iOS 版本与系统实现；无法识别时可使用页面文字输入。摄像头、麦克风和屏幕常亮能力也取决于当前 iOS 浏览器支持与系统权限。

## 本地运行

在项目目录运行 `node scripts/dev-server.mjs`，打开 `http://127.0.0.1:4173/`。真机访问摄像头和麦克风需要 HTTPS，建议用已发布的 GitHub Pages 地址测试。

主要模块位于：

- `dist/assets/services/`：摄像头、视觉 Mock、语音与 TTS 音频锁
- `dist/assets/core/`：事件存储、牌局状态机、规则与决策引擎
- `dist/assets/app.js`：页面渲染与交互编排

GitHub Pages 的子路径由应用自动推导，页面、脚本、图标与 Service Worker 都使用相对路径。修改后推送到 `main` 即会触发发布。
