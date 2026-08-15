# 로컬 검증용 정적 서버 — **캐시를 끈다**.
#
# ⚠️`python -m http.server` 를 쓰면 안 된다: Cache-Control 을 보내지 않아 브라우저가
#  옛 ES 모듈을 계속 실행한다. 고친 코드를 확인하는 중에 옛 코드를 보게 되는 사고가 실제로 났다.
#
#   python tools/nocache-server.py [포트]      (기본 9098)
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def log_message(self, fmt, *args):   # 요청 로그가 너무 시끄럽다 — 오류만 남긴다
        if args and str(args[1]).startswith(('4', '5')):
            sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 9098
    print('serving on http://127.0.0.1:%d (no-cache)' % port, flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), NoCache).serve_forever()
