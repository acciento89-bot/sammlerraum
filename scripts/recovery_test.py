"""Real isolated PostgreSQL17 recovery drill and adversarial integrity tests."""
import copy
import http.server
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import threading
import unittest
import uuid
from urllib.parse import urlsplit, urlunsplit

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).with_name('recovery.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
ROOT = Path(__file__).resolve().parents[1]


class RecoveryDrill(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory(prefix='sammlerraum-recovery-')
        cls.area = Path(cls.tmp.name).resolve()
        cls.source = 'sammlerraum_recovery_' + uuid.uuid4().hex[:10] + '_test'
        cls.target = 'sammlerraum_restore_' + uuid.uuid4().hex[:10] + '_test'
        cls.base_url = os.environ['RECOVERY_TEST_DATABASE_URL']
        parsed = urlsplit(cls.base_url)
        if parsed.hostname not in ('localhost', '127.0.0.1', '::1') or not parsed.path.endswith('_test'):
            raise RuntimeError('Only own local _test server allowed')
        cls.base_env = r.pg_env(cls.base_url)
        r.pg17(cls.base_env)
        cls.created = []
        cls.addClassCleanup(cls.cleanup)
        for name in (cls.source, cls.target):
            r.sql('CREATE DATABASE ' + r.quote(name), cls.base_env)
            cls.created.append(name)
        def url(name):
            return urlunsplit(parsed._replace(path='/' + name))
        cls.source_url, cls.target_url = url(cls.source), url(cls.target)
        cls.env = dict(os.environ, DATABASE_URL=cls.source_url, RESTORE_DATABASE_URL=cls.target_url,
                       RESTORE_SCRATCH_DATABASE=cls.target)
        source_env = r.pg_env(cls.source_url)
        for migration in sorted((ROOT / 'packages/db/prisma/migrations').glob('*/migration.sql')):
            r.command([r.client('psql'), '-Xq', '-v', 'ON_ERROR_STOP=1', '-f', str(migration)], source_env,
                      stdout=subprocess.DEVNULL, timeout=120)
        cls.uploads = cls.area / 'originals'
        cls.uploads.mkdir()
        cls.keys = ['owners/fixture/original.png', 'owners/fixture/thumb.webp',
                    'documents/fixture/private.pdf']
        cls.bytes = [b'owned image fixture\x00', b'owned thumbnail fixture', b'%PDF-1.7\nprivate owned fixture']
        for key, data in zip(cls.keys, cls.bytes):
            path = cls.uploads / key
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        ids = [str(uuid.uuid4()) for _ in range(3)]
        user = 'recovery-' + uuid.uuid4().hex
        r.sql(f'''INSERT INTO "user" (id,name,email,"updatedAt") VALUES
            ('{user}','Owned recovery fixture','{user}@example.test',now());''', source_env)
        for i, kind in ((0, 'IMAGE'), (2, 'DOCUMENT')):
            h = r.file_digest(cls.uploads / cls.keys[i])
            r.sql(f'''INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType",
                "byteSize","checksumSha256","originalFileName","updatedAt") VALUES
                ('{ids[i]}','{user}','{kind}','READY','{cls.keys[i]}','application/octet-stream',
                {h['bytes']},'{h['sha256']}','owned-fixture',now());''', source_env)
        h = r.file_digest(cls.uploads / cls.keys[1])
        r.sql(f'''INSERT INTO "MediaVariant" (id,"assetId",name,"storageKey","mimeType","byteSize",
            "checksumSha256",width,height) VALUES ('{ids[1]}','{ids[0]}','thumb','{cls.keys[1]}',
            'image/webp',{h['bytes']},'{h['sha256']}',1,1);''', source_env)
        import_id = str(uuid.uuid4())
        import_key = f'imports/{import_id}/source'
        path = cls.uploads / import_key
        path.parent.mkdir(parents=True)
        path.write_bytes(b'title,quantity\nowned import,1\n')
        r.sql(f'''INSERT INTO "ImportSourceObject" (id,"storageKey","expiresAt") VALUES
            ('{import_id}','{import_key}',now()+interval '1 day');''', source_env)
        cls.backup = cls.area / 'backup'
        result = cls.run_cli('backup', cls.backup, cls.uploads)
        if result.returncode:
            raise AssertionError(result.stderr)
        cls.restored = cls.area / 'restored'
        result = cls.run_cli('restore', cls.backup, cls.restored)
        if result.returncode:
            raise AssertionError(result.stderr)
        class Health(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                try:
                    r.sql('SELECT 1', r.pg_env(cls.target_url))
                    status, data = 200, {'status': 'ok', 'dependencies': {'database': 'up'}}
                    if self.path == '/unhealthy':
                        status, data = 503, {'status': 'degraded'}
                    elif self.path == '/wrong':
                        data = {'status': 'degraded'}
                except Exception:
                    status, data = 503, {'status': 'degraded'}
                self.send_response(status)
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())
            def log_message(self, *_):
                pass
        cls.http = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Health)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.addClassCleanup(cls.http.server_close)
        cls.addClassCleanup(cls.http.shutdown)
        cls.health = f'http://127.0.0.1:{cls.http.server_port}/health'

    @classmethod
    def cleanup(cls):
        # Only databases created by this process, never existing databases/volumes.
        for name in cls.created:
            r.sql('DROP DATABASE ' + r.quote(name), cls.base_env)
        cls.tmp.cleanup()

    @classmethod
    def run_cli(cls, op, backup, uploads, extra=(), env=None):
        return subprocess.run(['python3', str(ROOT / 'scripts/recovery.py'), op, str(backup),
                               '--uploads', str(uploads), *extra], env=env or cls.env,
                              capture_output=True, text=True, timeout=180)

    def verify(self, extra=None):
        return self.run_cli('verify', self.backup, self.restored,
                            ('--health-url', self.health) if extra is None else extra)

    def test_01_actual_dump_restore_and_database_health(self):
        self.assertEqual(self.verify().returncode, 0)
        m = json.loads((self.backup / 'manifest.json').read_text())
        self.assertEqual(len(m['objects']), 4)
        self.assertGreater(len(m['tables']), 60)
        self.assertEqual((self.restored / self.keys[2]).read_bytes(), self.bytes[2])
        self.assertNotIn('DATABASE_URL', (self.backup / 'manifest.json').read_text())
        self.assertEqual((self.backup / 'manifest.json').stat().st_mode & 0o077, 0)

    def test_02_missing_and_corrupt_restored_bytes_fail(self):
        path = self.restored / self.keys[0]
        original = path.read_bytes()
        try:
            path.unlink()
            self.assertNotEqual(self.verify().returncode, 0)
            path.write_bytes(b'wrong')
            self.assertNotEqual(self.verify().returncode, 0)
        finally:
            path.write_bytes(original)
        self.assertEqual(self.verify().returncode, 0)

    def test_03_manifest_and_dump_corruption_fail(self):
        path = self.backup / 'database.dump'
        original = path.read_bytes()
        try:
            path.write_bytes(original + b'corruption')
            self.assertNotEqual(self.verify().returncode, 0)
        finally:
            path.write_bytes(original)

    def test_04_database_count_mismatch_fails(self):
        target_env = r.pg_env(self.target_url)
        r.sql('CREATE TABLE recovery_extra (id integer)', target_env)
        try:
            self.assertNotEqual(self.verify().returncode, 0)
        finally:
            r.sql('DROP TABLE recovery_extra', target_env)
        self.assertEqual(self.verify().returncode, 0)

    def test_05_required_healthy_service_and_safe_target(self):
        self.assertNotEqual(self.verify(extra=()).returncode, 0)
        for path in ('unhealthy', 'wrong'):
            self.assertNotEqual(self.verify(extra=('--health-url', self.health.replace('/health', '/' + path))).returncode, 0)
        self.assertNotEqual(self.verify(extra=('--health-url', 'http://127.0.0.1:1/health')).returncode, 0)
        unsafe = dict(self.env, RESTORE_SCRATCH_DATABASE='not-the-target_test')
        self.assertNotEqual(self.run_cli('restore', self.backup, self.area / 'unsafe', env=unsafe).returncode, 0)
        # Existing valid restored DB/root must also be refused, never replaced.
        self.assertNotEqual(self.run_cli('restore', self.backup, self.restored).returncode, 0)

    def test_06_tar_traversal_symlink_duplicate_and_missing_reference(self):
        for bad in ('../escape', '/absolute', 'a/../escape', 'a\\escape'):
            with self.assertRaises(r.RecoveryError):
                r.key_path(bad)
        for kind in ('symlink', 'duplicate', 'traversal'):
            raw = io.BytesIO()
            with tarfile.open(fileobj=raw, mode='w') as archive:
                member = tarfile.TarInfo('../escape' if kind == 'traversal' else 'safe')
                if kind == 'symlink':
                    member.type, member.linkname = tarfile.SYMTYPE, '/etc/passwd'
                archive.addfile(member)
                if kind == 'duplicate':
                    archive.addfile(member)
            raw.seek(0)
            with tarfile.open(fileobj=raw, mode='r:') as archive:
                with self.assertRaises(r.RecoveryError):
                    r.archive_index(archive)
        with self.assertRaises(r.RecoveryError):
            r.check_references([{'key': 'missing'}], {})

    def test_07_backup_refuses_missing_or_changed_source_bytes(self):
        path = self.uploads / self.keys[0]
        original = path.read_bytes()
        try:
            path.unlink()
            self.assertNotEqual(self.run_cli('backup', self.area / 'missing', self.uploads).returncode, 0)
            self.assertFalse((self.area / 'missing/manifest.json').exists())
            path.write_bytes(b'changed')
            self.assertNotEqual(self.run_cli('backup', self.area / 'changed', self.uploads).returncode, 0)
            self.assertFalse((self.area / 'changed/manifest.json').exists())
        finally:
            path.write_bytes(original)

    def test_08_inflight_uploads_and_symlinks_refuse_completion(self):
        env = r.pg_env(self.source_url)
        user = r.sql('SELECT id FROM "user" LIMIT 1', env)
        asset_id = str(uuid.uuid4())
        r.sql(f'''INSERT INTO "MediaAsset" (id,"ownerId",kind,status,"storageKey","mimeType",
            "byteSize","checksumSha256","originalFileName","updatedAt") VALUES
            ('{asset_id}','{user}','IMAGE','UPLOADING','inflight/{asset_id}','image/png',1,
            '{'0' * 64}','inflight',now());''', env)
        try:
            self.assertNotEqual(self.run_cli('backup', self.area / 'inflight', self.uploads).returncode, 0)
            self.assertFalse((self.area / 'inflight/manifest.json').exists())
        finally:
            r.sql(f'''DELETE FROM "MediaAsset" WHERE id='{asset_id}';''', env)
        link = self.uploads / 'unsafe-link'
        link.symlink_to(self.uploads / self.keys[0])
        try:
            self.assertNotEqual(self.run_cli('backup', self.area / 'symlink', self.uploads).returncode, 0)
            self.assertFalse((self.area / 'symlink/manifest.json').exists())
        finally:
            link.unlink()


if __name__ == '__main__':
    unittest.main(verbosity=2)
