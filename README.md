# AI 麻将助手 Prototype

手机优先的静态 PWA 原型。直接以 HTTP/HTTPS 服务 `dist/` 目录即可运行。

主要模块位于：

- `dist/assets/services/`：摄像头、视觉 Mock、语音与 TTS 音频锁
- `dist/assets/core/`：事件存储、牌局状态机、规则与决策引擎
- `dist/assets/app.js`：页面渲染与交互编排

本地预览可在项目目录运行任意静态服务器，并将网站根目录指向 `dist/`。
