"""Install under deploy-core/app_hooks/ets2-data-dashboard/hooks.py in a tested service release."""
import deploy_core as core


def health(image):
    core.compose('exec', '-T', 'web', 'bun', 'apps/web/server/healthcheck.ts', image=image)


def accept(image):
    core.compose('exec', '-T', 'web', 'bun', 'apps/web/server/verify.ts', image=image)


def prepare(candidate, current):
    core.backup_database('cabmate')
    password = core.protected_file(core.APP.parents[1] / 'projects/cabmate/owner-password', 'Migration credential')
    core.run(['docker', 'run', '--rm', '--read-only', '--cap-drop', 'ALL', '--security-opt',
              'no-new-privileges:true', '--user', '501:20', '--network', 'platform-db',
              '--memory', '128m', '--cpus', '0.5', '--mount',
              f'type=bind,src={password},dst=/run/secrets/database_password,readonly',
              '--env', 'DATABASE_URL=postgres://cabmate_owner@postgres:5432/cabmate',
              '--env', 'DATABASE_PASSWORD_FILE=/run/secrets/database_password',
              '--env', 'DATABASE_RUNTIME_ROLE=cabmate_runtime',
              candidate, 'bun', 'apps/web/server/migrate.ts'])
