// API 配置
// 本地开发时使用本地 Worker，生产环境使用相对路径（通过 Pages Function 转发）
// Worker 端口固定为 8787（在 wrangler.toml 中配置）
const WORKER_PORT = import.meta.env.VITE_WORKER_PORT || '8787';
export const API_BASE = import.meta.env.DEV 
  ? `http://localhost:${WORKER_PORT}/api/admin`
  : '/api/admin';

