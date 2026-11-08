"""Real CMS encryption and scheduler safety; only disposable locally generated keys/data."""
import datetime as dt
import importlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
import uuid
import recovery

try:
    scheduler = importlib.import_module('backup_scheduler')
except ImportError:
    scheduler = None


class EncryptedBackupTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(scheduler, 'Actual encrypted backup scheduler must exist')
        self.tmp = tempfile.TemporaryDirectory(prefix='sammlerraum-encryption-test-')
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()
        self.key, self.cert = self.root/'key.pem', self.root/'public.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
                        '-subj','/CN=Owned temporary recovery test','-keyout',str(self.key),
                        '-out',str(self.cert)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.backup = self.root/'plain'
        self.backup.mkdir(mode=0o700)
        (self.backup/'database.dump').write_bytes(b'crypto fixture only; native database restoration is tested separately')
        with tarfile.open(self.backup/'uploads.tar','w') as archive:
            data = b'owned bytes' * 32
            info = tarfile.TarInfo('owned/source'); info.size=len(data)
            archive.addfile(info,io.BytesIO(data))
        self.manifest()

    def manifest(self):
        with tarfile.open(self.backup/'uploads.tar','r:') as archive:
            uploads = recovery.archive_index(archive)
        value = {'version':1,'postgresMajor':17,'objects':[], 'tables':[], 'uploads':uploads,
                 'artifacts':{n:recovery.file_digest(self.backup/n) for n in ['database.dump','uploads.tar']}}
        (self.backup/'manifest.json').write_text(json.dumps(value))

    def decrypt(self, source, target):
        return subprocess.run(['openssl','cms','-decrypt','-binary','-inform','DER','-in',str(source),
                               '-recip',str(self.cert),'-inkey',str(self.key),'-out',str(target)],
                              stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)

    def test_real_streaming_roundtrip_beyond_old_32mb_transport_bound(self):
        with tarfile.open(self.backup/'uploads.tar','w') as archive:
            data = b'x' * (34*1024*1024)
            info = tarfile.TarInfo('owned/large'); info.size=len(data)
            archive.addfile(info,io.BytesIO(data))
        self.manifest()
        final = self.root/'encrypted'/'owned.cms'
        receipt = scheduler.encrypt_backup(self.backup,final,self.cert)
        self.assertGreater(final.stat().st_size,32*1024*1024)
        self.assertEqual(final.stat().st_mode & 0o077,0)
        self.assertEqual(receipt['ciphertext'],recovery.file_digest(final))
        self.assertEqual(self.decrypt(final,self.root/'recovered.tar').returncode,0)
        with tarfile.open(self.root/'recovered.tar') as archive:
            self.assertEqual(set(archive.getnames()),{'database.dump','uploads.tar','manifest.json'})
            self.assertEqual(archive.extractfile('manifest.json').read(),(self.backup/'manifest.json').read_bytes())

    def test_tampered_authenticated_ciphertext_is_rejected(self):
        final = self.root/'encrypted'/'owned.cms'
        scheduler.encrypt_backup(self.backup,final,self.cert)
        data = bytearray(final.read_bytes()); data[len(data)//2] ^= 1; final.write_bytes(data)
        self.assertNotEqual(self.decrypt(final,self.root/'untrusted-partial.tar').returncode,0)

    def test_recovery_helper_verifies_ciphertext_before_safe_extraction(self):
        self.assertTrue(callable(getattr(scheduler,'decrypt_backup',None)))
        final=self.root/'encrypted'/'owned.cms'
        scheduler.encrypt_backup(self.backup,final,self.cert)
        target=self.root/'verified-recovery'
        scheduler.decrypt_backup(final,target,self.key,self.cert)
        self.assertEqual((target/'database.dump').read_bytes(),(self.backup/'database.dump').read_bytes())
        with self.assertRaises(recovery.RecoveryError):scheduler.decrypt_backup(final,target,self.key,self.cert)
        data=bytearray(final.read_bytes());data[len(data)//2]^=1;final.write_bytes(data)
        refused=self.root/'refused-recovery'
        with self.assertRaises(recovery.RecoveryError):scheduler.decrypt_backup(final,refused,self.key,self.cert)
        self.assertFalse((refused/'database.dump').exists())

    def test_existing_backup_is_never_overwritten(self):
        final = self.root/'encrypted'/'owned.cms'
        scheduler.encrypt_backup(self.backup,final,self.cert)
        before=final.read_bytes()
        with self.assertRaises(recovery.RecoveryError): scheduler.encrypt_backup(self.backup,final,self.cert)
        self.assertEqual(final.read_bytes(),before)

    def test_corrupt_plain_backup_cannot_publish_a_completion_receipt(self):
        (self.backup/'database.dump').write_bytes(b'changed after manifest')
        final = self.root/'encrypted'/'owned.cms'
        with self.assertRaises(recovery.RecoveryError): scheduler.encrypt_backup(self.backup,final,self.cert)
        self.assertFalse(final.exists())
        self.assertFalse(final.with_suffix('.json').exists())

    def test_utc_schedule_and_health_require_an_existing_recent_ciphertext(self):
        self.assertEqual(scheduler.daily_slot(dt.datetime(2026,11,8,2,59,tzinfo=dt.timezone.utc)),'2026-11-07')
        self.assertEqual(scheduler.daily_slot(dt.datetime(2026,11,8,3,0,tzinfo=dt.timezone.utc)),'2026-11-08')
        self.assertFalse(scheduler.healthy(self.root,dt.datetime.now(dt.timezone.utc)))

    def test_cleanup_removes_only_its_marked_staging_not_unknown_files(self):
        self.assertTrue(callable(getattr(scheduler,'cleanup_staging',None)))
        owned=self.root/'.stage-abcdefgh';owned.mkdir()
        (owned/'.sammlerraum-stage').write_text('v2\n')
        (owned/'temporary.dump').write_bytes(b'own incomplete generated bytes')
        unknown=self.root/'.stage-unknown1';unknown.mkdir()
        (unknown/'keep').write_bytes(b'not owned by scheduler')
        scheduler.cleanup_staging(self.root)
        self.assertFalse(owned.exists())
        self.assertTrue((unknown/'keep').exists())

    def test_rotation_keeps_newest_verified_backups_and_ignores_unrelated_files(self):
        self.assertTrue(callable(getattr(scheduler,'rotate_backups',None)))
        folder=self.root/'snapshots';folder.mkdir()
        files=[]
        for _ in range(3):
            file=folder/('sammlerraum-2026-11-08-'+uuid.uuid4().hex+'.cms')
            scheduler.encrypt_backup(self.backup,file,self.cert)
            files.append(file)
        unrelated=folder/'operator-keep.cms';unrelated.write_bytes(b'untouched')
        scheduler.rotate_backups(self.root,keep=2)
        self.assertFalse(files[0].exists())
        self.assertTrue(all(f.exists() for f in files[1:]))
        self.assertEqual(unrelated.read_bytes(),b'untouched')

    def test_rotation_refuses_changed_ciphertext_before_deleting_any_backup(self):
        self.assertTrue(callable(getattr(scheduler,'rotate_backups',None)))
        folder=self.root/'snapshots';folder.mkdir()
        files=[]
        for _ in range(3):
            file=folder/('sammlerraum-2026-11-08-'+uuid.uuid4().hex+'.cms')
            scheduler.encrypt_backup(self.backup,file,self.cert);files.append(file)
        data=bytearray(files[0].read_bytes());data[len(data)//2]^=1;files[0].write_bytes(data)
        with self.assertRaises(recovery.RecoveryError):scheduler.rotate_backups(self.root,keep=2)
        self.assertTrue(all(f.exists() for f in files))


if __name__ == '__main__': unittest.main(verbosity=2)
