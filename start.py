import http.server
import socketserver
import os
import sys

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # 强制所有响应不走缓存
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

PORT = 8000
# 切到脚本所在目录
os.chdir(os.path.dirname(os.path.abspath(__file__)))

Handler = NoCacheHandler
# 允许端口复用（防止上次没退出）
socketserver.TCPServer.allow_reuse_address = True

try:
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"✓ 服务已启动：http://localhost:{PORT}/")
        print("  按 Ctrl+C 停止")
        print("  已启用 no-cache，普通刷新即可看到最新版本")
        httpd.serve_forever()
except KeyboardInterrupt:
    print("\n服务已停止")
    sys.exit(0)
except OSError as e:
    print(f"✗ 启动失败：{e}")
    print(f"  可能端口 {PORT} 被占用，试试修改代码里的 PORT")
    sys.exit(1)