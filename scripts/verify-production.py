#!/usr/bin/env python3
"""Validate resolved private Compose configuration without printing secrets."""
import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen
from urllib.parse import urlsplit


class ProductionVerificationError(ValueError):
    pass


def require(value, message):
    if not value:
        raise ProductionVerificationError(message)


def memory_bytes(value):
    match = re.fullmatch(r'([0-9]+)([kmgt]i?b?|b)?', str(value).lower())
    require(match is not None, 'Finite memory bound required')
    suffix = (match.group(2) or 'b')[0]
    return int(match.group(1)) * {'b':1,'k':1024,'m':1024**2,'g':1024**3,'t':1024**4}[suffix]


def validate(config):
    services = config.get('services', {})
    require(set(services) == {'db', 'web', 'worker', 'migrate'}, 'Expected four bounded services')
    volumes = config.get('volumes', {})
    require(set(volumes) == {'database', 'uploads'}, 'Expected separate persistent volumes')
    require(all(v.get('external') is True and v.get('name') for v in volumes.values()), 'Explicit external volumes required')
    require(volumes['database']['name'] != volumes['uploads']['name'], 'Persistent volumes must differ')
    for name, service in services.items():
        require(re.fullmatch(r'(?:[^\s]+@)?sha256:[a-f0-9]{64}', service.get('image', '')), 'Immutable service image required')
        require(not service.get('build'), 'Production must not build or install source')
        require(memory_bytes(service.get('mem_limit', 0)) > 0 and float(service.get('cpus', 0)) > 0 and service.get('pids_limit', 0) > 0, 'Resource bounds required')
        require(not service.get('privileged') and not service.get('network_mode'), 'Unrestricted container mode refused')
        for mount in service.get('volumes', []):
            require(mount.get('type') == 'volume', 'Host bind mounts refused')
        if name != 'migrate':
            require(service.get('restart') == 'unless-stopped' and service.get('healthcheck', {}).get('test'), 'Restart and healthcheck required')
        else:
            require(service.get('restart') == 'no', 'Migration must be one-shot')
    require(not services['db'].get('ports') and not services['worker'].get('ports'), 'Database and worker must not be public')
    web_ports = services['web'].get('ports', [])
    require(len(web_ports) == 1 and web_ports[0].get('host_ip') == '127.0.0.1' and web_ports[0].get('target') == 3000, 'Web must bind only loopback proxy port')
    for name in ('web', 'worker'):
        service = services[name]
        env = service.get('environment', {})
        require(service.get('read_only') is True and service.get('tmpfs'), 'Read-only application with bounded temporary storage required')
        require('ALL' in service.get('cap_drop', []) and 'no-new-privileges:true' in service.get('security_opt', []), 'Application privilege reduction required')
        required = ('DATABASE_URL','APP_ORIGIN','BILLING_PLAN_LIMITS')
        require(all(isinstance(env.get(k), str) and env[k] for k in required), 'Required application configuration missing')
        require(env.get('NODE_ENV') == 'production' and env.get('UPLOADS_DIR') == '/data/uploads', 'Production environment/storage required')
        origin, database = urlsplit(env['APP_ORIGIN']), urlsplit(env['DATABASE_URL'])
        isolated_http = env.get('DEPLOYMENT_SCRATCH') == 'true' and database.path.endswith('_test') and origin.hostname in ('localhost','127.0.0.1','::1') and origin.scheme == 'http'
        require(origin.scheme == 'https' or isolated_http, 'HTTPS application origin or isolated loopback scratch required')
        # A source-ready release must not silently activate paid providers or marketplace transactions.
        for key in ('BILLING_ENABLED','AI_ANALYSIS_ENABLED','MARKET_SYNC_ENABLED','SCRYDEX_ENABLED','PRICECHARTING_ENABLED','NOTIFICATION_EMAIL_ENABLED'):
            require(env.get(key) == 'false', 'Separate provider activation required')
        for key, value in env.items():
            if any(token in key for token in ('ESCROW', 'PAYOUT', 'MARKETPLACE_PAYMENT')):
                require(str(value).lower() not in ('true', '1', 'yes'), 'User-to-user payment boundary violated')
        deps = service.get('depends_on', {})
        require(deps.get('db', {}).get('condition') == 'service_healthy' and deps.get('migrate', {}).get('condition') == 'service_completed_successfully', 'Migration/DB rollout gate missing')
        require(any(m.get('source') == 'uploads' and m.get('target') == '/data/uploads' for m in service.get('volumes', [])), 'Shared uploads mount missing')
    require(any(m.get('source') == 'database' and m.get('target') == '/var/lib/postgresql/data' for m in services['db'].get('volumes', [])), 'Persistent DB mount missing')
    require(services['web']['environment']['DATABASE_URL'] == services['worker']['environment']['DATABASE_URL'] == services['migrate'].get('environment', {}).get('DATABASE_URL'), 'Services must use the same database')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config-json', type=Path, help='Already resolved private Compose JSON')
    parser.add_argument('--health-url', help='Running recovered/current web API health endpoint')
    args = parser.parse_args()
    if args.config_json:
        config = json.loads(args.config_json.read_text())
    else:
        result = subprocess.run(['docker','compose','-f','docker-compose.prod.yml','config','--format','json'], capture_output=True, text=True, timeout=30)
        require(result.returncode == 0, 'Compose rendering failed; inspect private environment configuration')
        config = json.loads(result.stdout)
    validate(config)
    if args.health_url:
        with urlopen(args.health_url, timeout=10) as response:
            payload = json.loads(response.read(65537))
            require(response.status == 200 and payload.get('status') == 'ok' and payload.get('dependencies', {}).get('database') == 'up', 'Application/database health failed')
    print('PASS: immutable isolated production stack configuration' + (' and running application health' if args.health_url else '; running health not requested'))


if __name__ == '__main__':
    try:
        main()
    except ProductionVerificationError as error:
        print('Production verification refused: '+str(error),file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        print('Production verification failed; configuration, isolation or health gate refused', file=sys.stderr)
        sys.exit(1)
