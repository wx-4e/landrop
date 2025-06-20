### 配置
在 socket-service 处修改
```javascript
const SOCKET_CONFIG = {
  url: "http://192.168.0.2:9000", //改成自己的局域网地址
  options: {
    autoConnect: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  },
};
```
## 启动

**服务端**
```bash
cd server && pnpm i
pnpm dev
```

**客户端**
```bash
cd client && pnpm i
pnpm dev
```