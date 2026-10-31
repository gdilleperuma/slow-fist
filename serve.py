"""Serves the game folder on the local network so a phone can open it. Run: python v2/serve.py  (or double-click serve.bat)
Every response is marked no-store so the phone never shows an old build."""
import http.server, os, socket, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # the folder that holds v2/
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8766


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, max-age=0')
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write('%s %s\n' % (self.address_string(), fmt % args))


def addresses():
    out = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            out.add(info[4][0])
    except OSError:
        pass
    return sorted(a for a in out if not a.startswith('127.'))


if __name__ == '__main__':
    srv = http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    for a in addresses():
        print('Phone: http://%s:%d/v2/index.html' % (a, PORT))
    print('Serving', ROOT, '- Ctrl+C stops')
    srv.serve_forever()
