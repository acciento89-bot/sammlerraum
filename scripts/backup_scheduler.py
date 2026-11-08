#!/usr/bin/env python3
"""Own encrypted nightly backups. Server holds a public recipient certificate only."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
from types import SimpleNamespace
import uuid
import recovery

UTC = dt.timezone.utc


def atomic_json(path, value, replace=False):
    fd, temporary = tempfile.mkstemp(prefix='.receipt-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(value, output, indent=2)
            output.write('\n'); output.flush(); os.fsync(output.fileno())
        if replace:
            os.replace(temporary, path)
        else:
            os.link(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def encrypt_backup(source, destination, certificate):
    source, manifest = recovery.load_backup(source)
    destination, certificate = Path(destination), Path(certificate)
    recovery.private_directory(destination.parent)
    recovery.require(not destination.exists() and not destination.with_suffix('.json').exists(),
                     'Existing encrypted backup refused')
    recovery.require(certificate.is_file() and certificate.stat().st_size <= 65536,
                     'Public recipient certificate required')
    temporary = destination.with_name('.' + destination.name + '.partial-' + uuid.uuid4().hex)
    process = None
    try:
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as encrypted:
            process = subprocess.Popen(['openssl','cms','-encrypt','-binary','-aes-256-gcm',
                '-stream','-outform','DER','-recip',str(certificate),
                '-keyopt','rsa_padding_mode:oaep','-keyopt','rsa_oaep_md:sha256'],
                stdin=subprocess.PIPE, stdout=encrypted, stderr=subprocess.PIPE)
            with tarfile.open(fileobj=process.stdin, mode='w|') as bundle:
                for name in ['database.dump','uploads.tar','manifest.json']:
                    bundle.add(source/name, arcname=name, recursive=False)
            process.stdin.close(); process.stdin = None
            process.communicate(timeout=1800)
            recovery.require(process.returncode == 0, 'Authenticated backup encryption failed')
            encrypted.flush(); os.fsync(encrypted.fileno())
        receipt = {'version':2,'createdAt':dt.datetime.now(UTC).isoformat(),
                   'algorithm':'CMS-AES-256-GCM-RSA-OAEP-SHA256',
                   'ciphertext':recovery.file_digest(temporary),
                   'sourceManifest':recovery.file_digest(source/'manifest.json'),
                   'recipientCertificate':recovery.file_digest(certificate)}
        os.link(temporary,destination)
        atomic_json(destination.with_suffix('.json'),receipt)
        return receipt
    finally:
        if process and process.poll() is None:
            process.kill(); process.communicate()
        temporary.unlink(missing_ok=True)


def daily_slot(now):
    now = now.astimezone(UTC)
    return (now-dt.timedelta(days=1) if now.hour < 3 else now).date().isoformat()


def decrypt_backup(source, destination, private_key, certificate):
    source,certificate,private_key=Path(source),Path(certificate),Path(private_key)
    recovery.private_directory(source.parent)
    marker=source.with_suffix('.json')
    recovery.require(not source.is_symlink() and source.is_file() and not marker.is_symlink()
                     and marker.is_file() and marker.stat().st_size<=65536,'Trusted encrypted receipt required')
    receipt=json.loads(marker.read_text())
    recovery.require(receipt.get('version')==2 and receipt.get('algorithm')=='CMS-AES-256-GCM-RSA-OAEP-SHA256',
                     'Unsupported encrypted backup')
    recovery.require(recovery.file_digest(source)==receipt['ciphertext'],'Encrypted backup checksum mismatch')
    recovery.require(recovery.file_digest(certificate)==receipt['recipientCertificate'],'Wrong recovery recipient')
    destination=recovery.private_directory(destination,empty=True)
    created=[]
    verified=False
    try:
        with tempfile.TemporaryDirectory(prefix='.decrypt-',dir=destination) as temporary:
            clear=Path(temporary)/'bundle.tar'
            fd=os.open(clear,os.O_WRONLY | os.O_CREAT | os.O_EXCL,0o600)
            with os.fdopen(fd,'wb') as output:
                result=subprocess.run(['openssl','cms','-decrypt','-binary','-inform','DER','-in',str(source),
                    '-recip',str(certificate),'-inkey',str(private_key)],stdin=subprocess.DEVNULL,
                    stdout=output,stderr=subprocess.PIPE,timeout=1800)
            recovery.require(result.returncode==0,'Authenticated backup decryption failed')
            # Authenticate the entire ciphertext before exposing any recovered artifact.
            with tarfile.open(clear,'r:') as archive:
                members=archive.getmembers()
                recovery.require(len(members)==3 and {m.name for m in members}==
                                 {'database.dump','uploads.tar','manifest.json'} and
                                 all(m.isfile() for m in members),'Unsafe decrypted bundle')
                for member in members:
                    target=destination/member.name
                    fd=os.open(target,os.O_WRONLY | os.O_CREAT | os.O_EXCL,0o600)
                    created.append(target)
                    with os.fdopen(fd,'wb') as output,archive.extractfile(member) as incoming:
                        shutil.copyfileobj(incoming,output,length=1024*1024)
            recovery.require(recovery.file_digest(destination/'manifest.json')==receipt['sourceManifest'],
                             'Decrypted source manifest mismatch')
            recovery.load_backup(destination)
        verified=True
        return {'status':'verified','artifacts':3}
    finally:
        if not verified:
            for file in created:file.unlink(missing_ok=True)


def state(root):
    path = Path(root)/'status.json'
    if not path.exists(): return {'version':2}
    value = json.loads(path.read_text())
    recovery.require(value.get('version') == 2,'Unsupported scheduler status')
    return value


def healthy(root, now):
    try:
        value = state(root)
        if value.get('lastOutcome') == 'FAILED': return False
        success = value['lastSuccess']
        age = (now.astimezone(UTC)-dt.datetime.fromisoformat(success['createdAt'])).total_seconds()
        file = Path(root)/recovery.key_path(success['file'])
        return -300 <= age <= 36*3600 and not file.is_symlink() and file.is_file() and file.stat().st_size == success['ciphertext']['bytes']
    except (OSError, ValueError, KeyError, TypeError, recovery.RecoveryError):
        return False


def cleanup_staging(root):
    for directory in Path(root).glob('.stage-*'):
        if not re.fullmatch(r'\.stage-[a-z0-9_]{8}',directory.name): continue
        if directory.is_symlink() or not directory.is_dir() or directory.stat().st_uid != os.geteuid(): continue
        marker = directory/'.sammlerraum-stage'
        if marker.is_symlink() or not marker.is_file() or marker.stat().st_size != 3: continue
        if marker.read_text() == 'v2\n': shutil.rmtree(directory)


def rotate_backups(root, keep=7, recipient_fingerprint=None):
    recovery.require(type(keep) is int and 2 <= keep <= 30,'Invalid encrypted retention')
    folder=Path(root)/'snapshots'
    if not folder.exists(): return
    recovery.private_directory(folder)
    entries=[]
    for marker in folder.glob('sammlerraum-*.json'):
        if not re.fullmatch(r'sammlerraum-\d{4}-\d{2}-\d{2}-[a-f0-9]{32}\.json',marker.name): continue
        recovery.require(not marker.is_symlink() and marker.stat().st_size <= 65536,'Invalid encrypted receipt')
        value=json.loads(marker.read_text())
        recovery.require(value.get('version')==2 and value.get('algorithm')=='CMS-AES-256-GCM-RSA-OAEP-SHA256','Invalid encrypted receipt')
        if recipient_fingerprint and value['recipientCertificate']['sha256'] != recipient_fingerprint: continue
        file=marker.with_suffix('.cms')
        recovery.require(not file.is_symlink() and file.is_file() and file.stat().st_size==value['ciphertext']['bytes'],'Incomplete encrypted retention inventory')
        created=dt.datetime.fromisoformat(value['createdAt'])
        recovery.require(created.tzinfo is not None,'Invalid encrypted receipt time')
        entries.append((created,marker,file,value))
    old=sorted(entries,key=lambda entry:(entry[0],entry[1].name))[:-keep]
    # Verify every proposed deletion before deleting any file. Unknown files and
    # backups encrypted for a different recipient are never adopted or removed.
    for _,_,file,value in old:
        recovery.require(recovery.file_digest(file)==value['ciphertext'],'Changed encrypted backup retained')
    for _,marker,file,_ in old:
        file.unlink();marker.unlink()


def run_once(root, uploads, certificate, slot):
    recovery.require(re.fullmatch(r'\d{4}-\d{2}-\d{2}',slot),'Invalid backup slot')
    root = recovery.private_directory(root)
    root.chmod(0o700)
    lock_fd = os.open(root/'.lock',os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW,0o600)
    with os.fdopen(lock_fd,'a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX | fcntl.LOCK_NB)
        cleanup_staging(root)
        previous = state(root)
        if previous.get('lastSuccess',{}).get('slot') == slot and healthy(root,dt.datetime.now(UTC)):
            return previous['lastSuccess']
        attempt = previous.get('attempts',0)+1 if previous.get('slot') == slot else 1
        value = {**previous,'slot':slot,'attempts':attempt,'lastOutcome':'RUNNING',
                 'lastAttemptAt':dt.datetime.now(UTC).isoformat()}
        atomic_json(root/'status.json',value,replace=True)
        try:
            with tempfile.TemporaryDirectory(prefix='.stage-',dir=root) as staging:
                (Path(staging)/'.sammlerraum-stage').write_text('v2\n')
                plain = Path(staging)/'plain'
                recovery.backup(SimpleNamespace(backup=str(plain),uploads=str(uploads),referenced_only=True))
                name = 'snapshots/sammlerraum-' + slot + '-' + uuid.uuid4().hex + '.cms'
                receipt = encrypt_backup(plain,root/name,certificate)
            rotate_backups(root,recipient_fingerprint=receipt['recipientCertificate']['sha256'])
            success = {'slot':slot,'file':name,'createdAt':receipt['createdAt'],
                       'ciphertext':receipt['ciphertext']}
            atomic_json(root/'status.json',{**value,'lastOutcome':'SUCCESS','lastSuccess':success},replace=True)
            return success
        except Exception:
            atomic_json(root/'status.json',{**value,'lastOutcome':'FAILED'},replace=True)
            raise


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation',choices=['run','health','decrypt'])
    parser.add_argument('--root',default='/backups')
    parser.add_argument('--uploads',default='/data/uploads')
    parser.add_argument('--certificate')
    parser.add_argument('--encrypted')
    parser.add_argument('--private-key')
    parser.add_argument('--once',action='store_true')
    args = parser.parse_args()
    if args.operation == 'health':
        return 0 if healthy(args.root,dt.datetime.now(UTC)) else 1
    if args.operation == 'decrypt':
        recovery.require(args.encrypted and args.private_key and args.certificate,'Explicit recovery inputs required')
        decrypt_backup(args.encrypted,args.root,args.private_key,args.certificate)
        print('Encrypted backup recovered and verified',flush=True)
        return 0
    with tempfile.TemporaryDirectory(prefix='sammlerraum-public-certificate-') as temporary:
        certificate = args.certificate
        if not certificate:
            certificate = str(Path(temporary)/'recipient.pem')
            value = os.environ.get('RECOVERY_PUBLIC_CERTIFICATE','')
            recovery.require('BEGIN CERTIFICATE' in value and len(value) <= 65536,'Public recovery certificate required')
            Path(certificate).write_text(value)
        while True:
            now = dt.datetime.now(UTC)
            slot = daily_slot(now)
            current = state(args.root)
            done = current.get('lastSuccess',{}).get('slot') == slot and healthy(args.root,now)
            attempts = current.get('attempts',0) if current.get('slot') == slot else 0
            if not done and attempts < 8:
                try:
                    run_once(args.root,args.uploads,certificate,slot)
                    print('Verified encrypted backup completed',flush=True)
                except Exception:
                    print('Encrypted backup refused or failed; previous backups retained',flush=True)
                    if args.once: return 1
                if args.once: return 0
                time.sleep(15*60)
            else:
                if args.once: return 0 if done else 1
                time.sleep(60)


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError, recovery.RecoveryError, subprocess.SubprocessError):
        print('Encrypted backup unavailable: private prerequisites or verification failed',flush=True)
        raise SystemExit(1)
