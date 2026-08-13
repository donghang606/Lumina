# 快速启动（桌面 / Web 双路径）

> 前置：Node.js ≥ 22、pnpm ≥ 9。
> 桌面端还需要 Rust stable + Tauri 系统依赖（见 [DEVELOPMENT.md](DEVELOPMENT.md)）。

```bash
git clone https://github.com/<你的账号>/Lumina.git
cd Lumina
pnpm install
```

## 终端 1：后端服务

```bash
pnpm dev:server
# → Lumina Server: http://localhost:3001
```

首次启动会自动创建本地数据库（`apps/server/data`）。

## 桌面客户端

```bash
cd apps/desktop
pnpm tauri dev        # 开发模式，打开原生窗口
```

- 客户端默认连接 `http://localhost:3001`。
- 想要连接远程服务端：设置 → 数据 → 服务端地址，填入地址后回车保存，立即生效。

生产安装包：

```bash
cd apps/desktop
pnpm tauri build      # 产物：src-tauri/target/release/bundle/{dmg,app,deb,...}
```

## Web 端（自部署）

```bash
# 后端照常运行（终端 1）
cd apps/desktop
pnpm build            # 产物 dist/

# 用任意静态服务器托管 dist/，浏览器打开即可
npx serve dist -l 8080
```

### 生产部署（Nginx 示例）

```nginx
server {
  listen 80;
  server_name lumina.example.com;

  # 前端静态资源
  root /var/www/lumina/dist;
  location / {
    try_files $uri /index.html;
  }

  # 反向代理服务端 tRPC
  location /trpc/ {
    proxy_pass http://127.0.0.1:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
  }
}
```

## 验证

```bash
pnpm typecheck        # 类型检查
pnpm test             # 测试
```
