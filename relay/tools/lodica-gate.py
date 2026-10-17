#!/usr/bin/env python3
"""Device-gate admin tool. Install as root; symlink as lodica-approve, lodica-revoke, lodica-devices.

  lodica-approve <code> [label]   fetch the pending token from the relay, add it to the allow list, push
  lodica-revoke <code-or-label>   remove a device from the allow list, push
  lodica-devices                  list approved devices (never prints tokens)

Config (root only, outside any repo):
  /opt/lodica-gate/etc/dirs.conf     one gate directory per line (each gets a managed .htaccess block)
  /opt/lodica-gate/etc/devices.tsv   registry: code<TAB>label<TAB>token<TAB>date  (created by this tool, mode 600)
  /etc/lodica-relay/token        relay bearer token (read, never printed)
Env: LODICA_GATE_RELAY (default https://127.0.0.1:44741), LODICA_GATE_PUSH (default syntaxya-push; "none" skips),
     LODICA_GATE_ETC (default /opt/lodica-gate/etc), LODICA_GATE_REPO (repo to sanity check before pushing).
"""
import os, re, sys, ssl, json, subprocess, urllib.request, urllib.error, datetime

ETC = os.environ.get('LODICA_GATE_ETC', '/opt/lodica-gate/etc')
TOKEN_FILE = os.environ.get('LODICA_GATE_TOKEN_FILE', '/etc/lodica-relay/token')
RELAY = os.environ.get('LODICA_GATE_RELAY', 'https://127.0.0.1:44741')
PUSH = os.environ.get('LODICA_GATE_PUSH', 'syntaxya-push')
REPO = os.environ.get('LODICA_GATE_REPO', '/home/shared/syntaxya')
BEGIN, END = '# BEGIN lodica-gate (managed by lodica-approve; do not edit)', '# END lodica-gate'
CODE_RE = re.compile(r'^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$')
TOKEN_RE = re.compile(r'^[0-9a-f]{64}$')
LABEL_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$')


def die(msg, code=1):
    print(msg, file=sys.stderr); sys.exit(code)


def registry():
    path = os.path.join(ETC, 'devices.tsv')
    rows = []
    if os.path.exists(path):
        for line in open(path):
            p = line.rstrip('\n').split('\t')
            if len(p) == 4: rows.append(p)
    return rows


def save_registry(rows):
    os.makedirs(ETC, mode=0o700, exist_ok=True)
    path = os.path.join(ETC, 'devices.tsv')
    fd = os.open(path + '.tmp', os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as f:
        for r in rows: f.write('\t'.join(r) + '\n')
    os.replace(path + '.tmp', path)


def gate_dirs():
    try:
        return [l.strip() for l in open(os.path.join(ETC, 'dirs.conf')) if l.strip() and not l.startswith('#')]
    except FileNotFoundError:
        die('missing %s/dirs.conf (one gate directory per line)' % ETC)


def block(tokens):
    """Managed LiteSpeed/Apache-compatible mod_rewrite block. No tokens: everything is denied."""
    out = [BEGIN, '<IfModule mod_rewrite.c>', 'RewriteEngine On']
    if tokens:
        for i, t in enumerate(tokens):
            last = i == len(tokens) - 1
            out.append('RewriteCond %%{HTTP:X-Lodica-Gate} =%s [OR]' % t)
            out.append('RewriteCond %%{HTTP_COOKIE} (^|;\\s*)lodica_gate=%s(;|$)%s' % (t, '' if last else ' [OR]'))
        out.append('RewriteRule ^ - [S=1]')
    out.append('RewriteRule ^ - [F,L]')
    out += ['</IfModule>', END]
    return '\n'.join(out) + '\n'


def apply(rows):
    blk = block([r[2] for r in rows])
    for d in gate_dirs():
        os.makedirs(d, exist_ok=True)
        path = os.path.join(d, '.htaccess')
        cur = open(path).read() if os.path.exists(path) else ''
        pat = re.compile(re.escape(BEGIN) + r'.*?' + re.escape(END) + r'\n?', re.S)
        new = pat.sub('', cur).lstrip('\n')
        open(path, 'w').write(blk + ('\n' + new if new else ''))
        print('updated', path)


def sane():
    """Refuse to push when the private repo looks wrong (secret files, no repo, wrong branch)."""
    def git(*a):
        r = subprocess.run(['git', '-C', REPO, '-c', 'safe.directory=' + REPO] + list(a), capture_output=True, text=True)
        if r.returncode: die('git %s failed: %s' % (a[0], r.stderr.strip()))
        return r.stdout
    if git('rev-parse', '--abbrev-ref', 'HEAD').strip() != 'main': die('syntaxya repo is not on main; not pushing')
    files = git('ls-files', '-c', '-o', '--exclude-standard').splitlines()
    bad = [f for f in files if os.path.basename(f) in ('config.php', 'syntaxya-config.php') or f.endswith(('.pem', '.key'))]
    if bad: die('secret-looking files would be pushed: %s' % ', '.join(bad))


def push():
    if PUSH == 'none': print('push skipped (LODICA_GATE_PUSH=none)'); return
    sane()
    r = subprocess.run([PUSH])
    if r.returncode: die('push failed (exit %d); .htaccess files are updated locally' % r.returncode)


def fetch(code):
    tok = open(TOKEN_FILE).read().strip()
    ctx = ssl.create_default_context()
    if RELAY.startswith('https://127.0.0.1') or RELAY.startswith('https://localhost'):
        ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE  # loopback only
    req = urllib.request.Request(RELAY + '/pending/' + code, headers={'Authorization': 'Bearer ' + tok})
    try:
        with urllib.request.urlopen(req, context=ctx, timeout=10) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        die('relay says %d: unknown or expired code' % e.code if e.code == 404 else 'relay error %d' % e.code)
    except OSError as e:
        die('cannot reach relay: %s' % e)


def approve(argv):
    if not argv: die('usage: lodica-approve <code> [label]')
    code = argv[0].strip().upper()
    if not CODE_RE.match(code): die('bad code format (expected XXXX-XXXX)')
    rows = registry()
    got = fetch(code)
    token = got.get('token', '')
    if not TOKEN_RE.match(token): die('relay returned an invalid token')
    label = argv[1] if len(argv) > 1 else re.sub(r'[^A-Za-z0-9._-]', '', got.get('label', '').replace(' ', '-'))[:32]
    if not LABEL_RE.match(label or ''): label = 'device-%s' % code[:4].lower()
    if any(r[1] == label for r in rows):
        n = 2
        while any(r[1] == '%s-%d' % (label, n) for r in rows): n += 1
        label = '%s-%d' % (label, n)
    rows = [r for r in rows if r[2] != token]
    rows.append([code, label, token, datetime.date.today().isoformat()])
    save_registry(rows); apply(rows); push()
    print('approved %s as %s' % (code, label))


def revoke(argv):
    if not argv: die('usage: lodica-revoke <code-or-label>')
    key = argv[0].strip()
    rows = registry()
    keep = [r for r in rows if r[0] != key.upper() and r[1] != key]
    if len(keep) == len(rows): die('no such device: %s' % key)
    save_registry(keep); apply(keep); push()
    print('revoked %s (%d device(s) remain)' % (key, len(keep)))


def devices():
    rows = registry()
    if not rows: print('no devices'); return
    for code, label, token, date in rows:
        print('%-24s %s  %s  token ...%s' % (label, code, date, token[-6:]))


if __name__ == '__main__':
    if os.geteuid() != 0 and os.environ.get('LODICA_GATE_ETC') is None: die('run as root (sudo %s)' % os.path.basename(sys.argv[0]))
    name = os.path.basename(sys.argv[0])
    cmd = {'lodica-approve': approve, 'lodica-revoke': revoke, 'lodica-devices': lambda a: devices()}.get(name)
    if cmd is None and len(sys.argv) > 1: cmd = {'approve': approve, 'revoke': revoke, 'devices': lambda a: devices()}.get(sys.argv[1]); sys.argv.pop(1)
    if cmd is None: die(__doc__)
    cmd(sys.argv[1:])
