"""Resolved Compose security contract; actual rendering/runtime is a separate Docker CI gate."""
import copy
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('production', Path(__file__).with_name('verify-production.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def fixture():
    env = dict(DATABASE_URL='postgresql://test:test@db:5432/sammlerraum_test', APP_ORIGIN='https://example.test', BILLING_PLAN_LIMITS='explicit-fixture-policy', NODE_ENV='production', UPLOADS_DIR='/data/uploads')
    for k in ('BILLING_ENABLED','AI_ANALYSIS_ENABLED','MARKET_SYNC_ENABLED','SCRYDEX_ENABLED','PRICECHARTING_ENABLED','NOTIFICATION_EMAIL_ENABLED'):
        env[k] = 'false'
    def service(name):
        return dict(image='sha256:'+'a'*64, mem_limit=536870912, cpus=1.0, pids_limit=128, restart='unless-stopped', healthcheck={'test':['CMD','true']}, environment=dict(env), volumes=[])
    services = {name: service(name) for name in ('db','web','worker','migrate')}
    services['migrate']['restart'] = 'no'
    services['web']['ports'] = [{'host_ip':'127.0.0.1','target':3000,'published':'3000'}]
    services['db']['volumes'] = [{'type':'volume','source':'database','target':'/var/lib/postgresql/data'}]
    for name in ('web','worker'):
        services[name].update(read_only=True, tmpfs=['/tmp:size=1000'], cap_drop=['ALL'], security_opt=['no-new-privileges:true'], depends_on={'db':{'condition':'service_healthy'},'migrate':{'condition':'service_completed_successfully'}}, volumes=[{'type':'volume','source':'uploads','target':'/data/uploads'}])
    return {'services':services,'volumes':{'database':{'external':True,'name':'owned-db'},'uploads':{'external':True,'name':'owned-uploads'}}}


class ConfigContract(unittest.TestCase):
    def test_valid_closed_immutable_stack(self):
        m.validate(fixture())

    def test_rejects_mutable_images_builds_binds_public_db_and_privileges(self):
        mutations = [
            ('web','image','repo/web:latest'), ('worker','build','.'),
            ('web','volumes',[{'type':'bind','source':'.','target':'/app'}]),
            ('db','ports',[{'target':5432}]), ('worker','privileged',True),
            ('web','ports',[{'host_ip':'0.0.0.0','target':3000}]),
            ('worker','mem_limit',0), ('worker','read_only',False),
            ('web','depends_on',{}), ('web','cap_drop',[]),
        ]
        for service, key, value in mutations:
            c = fixture()
            c['services'][service][key] = value
            with self.subTest(service=service,key=key), self.assertRaises(ValueError):
                m.validate(c)

    def test_rejects_missing_runtime_configuration_and_provider_or_payout_activation(self):
        for key, value in [('DATABASE_URL',''),('BILLING_PLAN_LIMITS',''),('AI_ANALYSIS_ENABLED','true'),('BILLING_ENABLED','true'),('MARKETPLACE_PAYMENTS_ENABLED','true'),('PAYOUT_ENABLED','true')]:
            c = fixture()
            c['services']['web']['environment'][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                m.validate(c)

    def test_rejects_wrong_volumes_or_database_binding(self):
        c = fixture(); c['volumes']['uploads']['name'] = 'owned-db'
        with self.assertRaises(ValueError): m.validate(c)
        c = fixture(); c['services']['worker']['environment']['DATABASE_URL'] += '_other'
        with self.assertRaises(ValueError): m.validate(c)
        c = fixture(); c['volumes']['database']['external'] = False
        with self.assertRaises(ValueError): m.validate(c)


if __name__ == '__main__':
    unittest.main(verbosity=2)
