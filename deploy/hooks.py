"""Install under deploy-core/app_hooks/ets2-data-dashboard/hooks.py in a tested service release."""
import deploy_core as core


def health(image):
    core.compose('exec', '-T', 'web', 'bun', 'apps/web/server/healthcheck.ts', image=image)


def accept(image):
    core.compose('exec', '-T', 'web', 'bun', 'apps/web/server/verify.ts', image=image)


def prepare(candidate, current):
    core.backup_database('ets2')
    password = core.protected_file(core.APP.parents[1] / 'projects/ets2/owner-password', 'Migration credential')
    core.run(['docker', 'run', '--rm', '--read-only', '--cap-drop', 'ALL', '--security-opt',
              'no-new-privileges:true', '--user', '501:20', '--network', 'platform-db',
              '--memory', '128m', '--cpus', '0.5', '--mount',
              f'type=bind,src={password},dst=/run/secrets/database_password,readonly',
              '--env', 'DATABASE_URL=postgres://ets2_owner@postgres:5432/ets2',
              '--env', 'DATABASE_PASSWORD_FILE=/run/secrets/database_password',
              '--env', 'DATABASE_RUNTIME_ROLE=ets2_runtime',
              candidate, 'bun', 'apps/web/server/migrate.ts'])
