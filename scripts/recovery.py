#!/usr/bin/env python3
"""Offline PostgreSQL17 + uploads recovery. No dependency or secret export."""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from urllib.parse import urlsplit, unquote, parse_qsl
from urllib.request import urlopen


class RecoveryError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise RecoveryError(message)


def digest(stream):
    h = hashlib.sha256()
    size = 0
    while block := stream.read(1024 * 1024):
        h.update(block)
        size += len(block)
    return {'sha256': h.hexdigest(), 'bytes': size}


def file_digest(path):
    with path.open('rb') as stream:
        return digest(stream)


def key_path(key):
    require(isinstance(key, str) and key and '\\' not in key and ':' not in key
            and '\x00' not in key and not key.startswith('/'), 'Unsafe object key')
    require(all(p not in ('', '.', '..') for p in key.split('/')), 'Unsafe object key')
    return PurePosixPath(key)


def private_directory(path, empty=False):
    path = Path(os.path.abspath(path))
    for parent in [path, *path.parents]:
        require(not parent.is_symlink(), 'Symlink directory refused')
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(path.is_dir(), 'Directory required')
    if empty:
        require(not any(path.iterdir()), 'Destination must be empty')
    return path


def pg_env(url, scratch=False):
    require(url is not None, 'DATABASE_URL is required')
    p = urlsplit(url)
    require(p.scheme in ('postgres', 'postgresql') and p.hostname, 'PostgreSQL URL required')
    name = unquote(p.path.removeprefix('/'))
    if scratch:
        require(name.endswith('_test') and name == os.environ.get('RESTORE_SCRATCH_DATABASE'),
                'Explicit matching RESTORE_SCRATCH_DATABASE ending _test is required')
    env = dict(os.environ, PGDATABASE=name, PGHOST=p.hostname, PGPORT=str(p.port or 5432),
               PGUSER=unquote(p.username or ''), PGPASSWORD=unquote(p.password or ''),
               PGCONNECT_TIMEOUT='10', PGAPPNAME='sammlerraum-recovery')
    for key, value in parse_qsl(p.query):
        require(key in ('sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'channel_binding'),
                'Unsupported connection parameter')
        env['PG' + key.upper().replace('_', '')] = value
    env['PGOPTIONS'] = '-c statement_timeout=120000 -c lock_timeout=10000'
    env.pop('DATABASE_URL', None)
    return env


def client(name):
    candidate = os.environ.get(name.upper(), name)
    require(shutil.which(candidate), 'Required PostgreSQL client missing: ' + name)
    return candidate


def command(args, env, **kwargs):
    # Never expose client diagnostics: connection strings can contain credentials.
    result = subprocess.run(args, env=env, stderr=subprocess.PIPE, **kwargs)
    require(result.returncode == 0, 'PostgreSQL operation failed; inspect private operator logs')
    return result


def sql(query, env):
    result = command([client('psql'), '-XAtq', '-v', 'ON_ERROR_STOP=1', '-c', query],
                     env, stdout=subprocess.PIPE, text=True, timeout=120)
    return result.stdout.strip()


def pg17(env):
    require(sql("SELECT current_setting('server_version_num')::integer / 10000", env) == '17',
            'PostgreSQL17 server required')
    for name in ('pg_dump', 'pg_restore'):
        r = command([client(name), '--version'], env, stdout=subprocess.PIPE, text=True, timeout=10)
        require(re.search(r'\b17[.]', r.stdout), 'PostgreSQL17 clients required')


class Snapshot:
    def __init__(self, env):
        self.errors = tempfile.TemporaryFile(mode='w+')
        self.process = subprocess.Popen([client('psql'), '-XAtq', '-v', 'ON_ERROR_STOP=1'],
                                        env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.errors, text=True, bufsize=1)
        self.ask('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
        self.id = self.ask('SELECT pg_export_snapshot();')[0]
        require(re.fullmatch(r'[0-9A-F]+-[0-9A-F]+-[0-9]+', self.id), 'Invalid snapshot')

    def ask(self, query):
        self.process.stdin.write(query + "\nSELECT '__SAMMLERRAUM_END__';\n")
        self.process.stdin.flush()
        result = []
        for line in self.process.stdout:
            line = line.rstrip('\n')
            if line == '__SAMMLERRAUM_END__':
                return result
            if line:
                result.append(line)
        raise RecoveryError('Snapshot query failed')

    def close(self):
        if self.process.poll() is None:
            self.process.stdin.write('ROLLBACK;\n\\q\n')
            self.process.stdin.flush()
            self.process.wait(timeout=15)
        self.process.stdin.close()
        self.process.stdout.close()
        self.errors.close()


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def db_inventory(snapshot):
    busy = snapshot.ask('''SELECT (SELECT count(*) FROM "MediaAsset" WHERE
        status IN ('UPLOADING','PROCESSING') OR "cleanupStartedAt" IS NOT NULL)
        + (SELECT count(*) FROM "ImportSourceObject" WHERE "deletedAt" IS NULL
        AND "cleanupStartedAt" IS NOT NULL);''')
    require(busy == ['0'], 'Quiesce uploads, processing and cleanup before backup')
    rows = snapshot.ask('''SELECT json_build_object('key', "storageKey", 'bytes', "byteSize"::text,
        'sha256', "checksumSha256") FROM "MediaAsset"
        UNION ALL SELECT json_build_object('key', "storageKey", 'bytes', "byteSize"::text,
        'sha256', "checksumSha256") FROM "MediaVariant"
        UNION ALL SELECT json_build_object('key', "storageKey") FROM "ImportSourceObject"
        WHERE "deletedAt" IS NULL;''')
    objects = [json.loads(row) for row in rows]
    for item in objects:
        key_path(item['key'])
    tables = [json.loads(row) for row in snapshot.ask('''SELECT json_build_array(schemaname, tablename)
        FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')
        ORDER BY schemaname, tablename;''')]
    counts = []
    for schema, table in tables:
        count = int(snapshot.ask(f'SELECT count(*) FROM {quote(schema)}.{quote(table)};')[0])
        counts.append({'schema': schema, 'table': table, 'rows': count})
    require(any(t['table'] == 'MediaAsset' for t in counts), 'Not a Sammlerraum database')
    return objects, counts


def archive_index(archive):
    result = {}
    for member in archive:
        key_path(member.name)
        require(member.isfile() and member.name not in result, 'Non-file/duplicate archive entry refused')
        stream = archive.extractfile(member)
        with stream:
            result[member.name] = digest(stream)
    return result


def check_references(objects, index):
    for item in objects:
        key = item['key']
        key_path(key)
        require(key in index, 'Referenced object missing')
        if 'bytes' in item:
            require(int(item['bytes']) == index[key]['bytes'] and item['sha256'] == index[key]['sha256'],
                    'Referenced object checksum/size mismatch')


def backup(args):
    env = pg_env(os.environ.get('DATABASE_URL'))
    pg17(env)
    require(Path(args.uploads).is_dir(), 'Existing uploads root required')
    root = private_directory(args.uploads)
    destination = private_directory(args.backup, empty=True)
    destination.chmod(0o700)
    require(destination != root and root not in destination.parents and destination not in root.parents,
            'Backup and uploads must be separate directory trees')
    snapshot = Snapshot(env)
    try:
        objects, counts = db_inventory(snapshot)
        command([client('pg_dump'), '--format=custom', '--no-owner', '--no-acl',
                 '--snapshot=' + snapshot.id, '--file=' + str(destination / 'database.dump')],
                env, timeout=1800)
        with tarfile.open(destination / 'uploads.tar', 'w') as archive:
            for base, dirs, files in os.walk(root, followlinks=False):
                for name in dirs + files:
                    require(not (Path(base) / name).is_symlink(), 'Uploads symlink refused')
                for name in sorted(files):
                    path = Path(base) / name
                    require(path.is_file(), 'Special uploads entry refused')
                    archive.add(path, arcname=path.relative_to(root).as_posix(), recursive=False)
        with tarfile.open(destination / 'uploads.tar', 'r:') as archive:
            index = archive_index(archive)
        check_references(objects, index)
        manifest = {'version': 1, 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(),
                    'postgresMajor': 17, 'objects': objects, 'tables': counts, 'uploads': index,
                    'artifacts': {name: file_digest(destination / name)
                                  for name in ('database.dump', 'uploads.tar')}}
        # Atomic manifest is the completion marker; an incomplete directory is never a backup.
        temporary = destination / 'manifest.incomplete'
        temporary.write_text(json.dumps(manifest, indent=2) + '\n')
        temporary.replace(destination / 'manifest.json')
    finally:
        snapshot.close()
    print('Backup verified: database snapshot and archived object bytes agree')


def load_backup(path):
    path = private_directory(path)
    manifest = json.loads((path / 'manifest.json').read_text())
    require(manifest.get('version') == 1 and manifest.get('postgresMajor') == 17, 'Unsupported manifest')
    require(set(manifest['artifacts']) == {'database.dump', 'uploads.tar'}, 'Invalid artifact manifest')
    for name, expected in manifest['artifacts'].items():
        require((path / name).is_file() and not (path / name).is_symlink(), 'Invalid backup artifact')
        require(file_digest(path / name) == expected, 'Backup artifact checksum mismatch')
    with tarfile.open(path / 'uploads.tar', 'r:') as archive:
        index = archive_index(archive)
    require(index == manifest['uploads'], 'Archive inventory mismatch')
    check_references(manifest['objects'], index)
    return path, manifest


def compare_database(manifest, env):
    snap = Snapshot(env)
    try:
        objects, counts = db_inventory(snap)
    finally:
        snap.close()
    require(sorted(objects, key=lambda v: v['key']) == sorted(manifest['objects'], key=lambda v: v['key']),
            'Restored database object inventory mismatch')
    require(counts == manifest['tables'], 'Restored database table counts mismatch')


def restore(args):
    path, manifest = load_backup(args.backup)
    env = pg_env(os.environ.get('RESTORE_DATABASE_URL'), scratch=True)
    pg17(env)
    require(sql("SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')", env)
            == '0', 'Scratch database must be empty; no existing schema/data will be replaced')
    root = private_directory(args.uploads, empty=True)
    require(root != path and root not in path.parents and path not in root.parents,
            'Backup and restore roots must be separate')
    command([client('pg_restore'), '--exit-on-error', '--no-owner', '--no-acl',
             '--dbname=' + unquote(urlsplit(os.environ['RESTORE_DATABASE_URL']).path.removeprefix('/')),
             str(path / 'database.dump')], env, timeout=1800)
    with tarfile.open(path / 'uploads.tar', 'r:') as archive:
        for member in archive:
            key_path(member.name)
            require(member.isfile(), 'Unsafe archive member')
            target = root / member.name
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with archive.extractfile(member) as source, target.open('xb') as output:
                shutil.copyfileobj(source, output, length=1024 * 1024)
    compare_database(manifest, env)
    (root / '.sammlerraum-restore.json').write_text(json.dumps(file_digest(path / 'manifest.json')))
    print('Scratch database and uploads restored; run verify-restore with recovered service health URL')


def verify(args):
    path, manifest = load_backup(args.backup)
    env = pg_env(os.environ.get('RESTORE_DATABASE_URL'), scratch=True)
    pg17(env)
    compare_database(manifest, env)
    root = private_directory(args.uploads)
    require(json.loads((root / '.sammlerraum-restore.json').read_text()) == file_digest(path / 'manifest.json'),
            'Restore receipt does not match backup')
    for name, expected in manifest['uploads'].items():
        key_path(name)
        target = root / name
        require(not any(p.is_symlink() for p in [target, *target.parents]), 'Restored symlink refused')
        require(target.is_file() and file_digest(target) == expected, 'Restored object missing or corrupt')
    url = urlsplit(args.health_url)
    require(url.scheme in ('http', 'https') and url.hostname and not url.username and not url.password,
            'Safe health URL required')
    with urlopen(args.health_url, timeout=10) as response:
        require(response.status == 200, 'Recovered service unhealthy')
        body = json.loads(response.read(65537))
        require(body.get('status') == 'ok', 'Recovered service health must report status ok')
    print('PASS: restored DB counts, references, byte checksums and recovered service health')


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=['backup', 'restore', 'verify'])
    parser.add_argument('backup', help='Private backup directory; empty for backup creation')
    parser.add_argument('--uploads', required=True, help='Explicit uploads/empty scratch restore root')
    parser.add_argument('--health-url', help='Recovered service health URL (required for verify)')
    args = parser.parse_args()
    if args.operation == 'verify':
        require(args.health_url, '--health-url is required')
    {'backup': backup, 'restore': restore, 'verify': verify}[args.operation](args)


if __name__ == '__main__':
    try:
        main()
    except RecoveryError as error:
        print('Recovery refused: ' + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired, tarfile.TarError):
        # Operator credentials and private object names must not leak through tracebacks.
        print('Recovery failed: prerequisites, integrity, isolation or health check did not pass', file=sys.stderr)
        sys.exit(1)
