#!/usr/bin/env python3
"""基线重放门禁：导入 schema+种子 → 启动 ready → 二次启动幂等 → 备份/恢复 → 再启动。

目标库连接只从环境变量读取：
  BASELINE_TARGET_DB_URL / BASELINE_TARGET_DB_USERNAME / BASELINE_TARGET_DB_PASSWORD

安全：必须显式 --allow-reset，且库名不能是 fengsong，只允许含 test/baseline/replay 的库。
用法：
  python3 scripts/doc-baseline/replay_check.py --allow-reset --jar backend/target/mftb-admin.jar
"""
import argparse
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db_utils  # noqa: E402


def start_app(jar, port, log_path, timeout, run_name):
    java = os.path.join(os.environ['JAVA_HOME'], 'bin', 'java') if os.environ.get('JAVA_HOME') \
        else shutil.which('java')
    if not java:
        raise SystemExit('找不到 java；请设置 JAVA_HOME')
    env = dict(os.environ)
    # 应用读的是 DB_URL/DB_USERNAME/DB_PASSWORD；必须从 BASELINE_TARGET_* 显式映射，
    # 不能依赖调用方 shell 里残留的 DB_URL（否则会误连其它库或 CI 直接缺变量启动失败）。
    env.update({
        'DB_URL': os.environ['BASELINE_TARGET_DB_URL'],
        'DB_USERNAME': os.environ['BASELINE_TARGET_DB_USERNAME'],
        'DB_PASSWORD': os.environ.get('BASELINE_TARGET_DB_PASSWORD', ''),
    })
    storage_root = os.environ.get('BASELINE_DOC_STORAGE_ROOT') or os.path.join(tempfile.gettempdir(), 'doc-assets')
    os.makedirs(storage_root, exist_ok=True)
    env.update({
        'SCHEMA_STRICT': 'true',
        'SPRING_LAZY_INIT': 'false',
        'RDM_DAILY_REPORT_ENABLED': 'false',
        'TENCENT_DOCS_SYNC_ENABLED': 'false',
        'AI_RUN_WORKER_ENABLED': 'false',
        'DOC_STORAGE_LOCAL_ROOT': storage_root,
        'JWT_SECRET': env.get('JWT_SECRET') or secrets.token_urlsafe(48),
    })
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    log = open(log_path, 'w', encoding='utf-8')
    proc = subprocess.Popen([java, '-jar', jar, f'--server.port={port}'],
                            env=env, stdout=log, stderr=subprocess.STDOUT)
    deadline = time.time() + timeout
    print(f'[{run_name}] started pid={proc.pid}, waiting ready ...', flush=True)
    while time.time() < deadline:
        if proc.poll() is not None:
            log.close()
            tail = open(log_path, encoding='utf-8', errors='replace').read()[-4000:]
            raise SystemExit(f'[{run_name}] 进程提前退出 code={proc.returncode}\n{tail}')
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/health/ready', timeout=2) as r:
                if r.status == 200:
                    print(f'[{run_name}] ready after {int(timeout - (deadline - time.time()))}s', flush=True)
                    return proc, log
        except (urllib.error.URLError, ConnectionError, TimeoutError):
            time.sleep(1)
    proc.terminate()
    log.close()
    raise SystemExit(f'[{run_name}] 等待 ready 超时（{timeout}s）')


def stop_app(proc, log):
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=10)
    log.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--jar', default=os.path.join('backend', 'target', 'mftb-admin.jar'))
    parser.add_argument('--port', type=int, default=18080)
    parser.add_argument('--timeout', type=int, default=900)
    parser.add_argument('--allow-reset', action='store_true')
    parser.add_argument('--skip-backup', action='store_true')
    parser.add_argument('--baseline-dir', default=os.path.join('backend', 'sql', 'baseline'))
    parser.add_argument('--work-dir', default=os.path.join(tempfile.gettempdir(), 'doc-baseline'))
    args = parser.parse_args()

    schema = os.path.join(args.baseline_dir, 'doc_baseline_schema.sql')
    seed = os.path.join(args.baseline_dir, 'doc_baseline_seed.sql')
    for path in (schema, seed, args.jar):
        if not os.path.exists(path):
            raise SystemExit(f'缺少文件: {path}')
    os.makedirs(args.work_dir, exist_ok=True)

    conn = db_utils.connect('BASELINE_TARGET_DB')
    db_utils.assert_safe_target(conn, args.allow_reset)
    db_name = db_utils.database_name(conn)
    print(f'target database: {db_name}', flush=True)

    db_utils.drop_all(conn)
    db_utils.execute_file(conn, schema)
    db_utils.execute_file(conn, seed)
    translation = os.path.join(args.baseline_dir, 'doc_baseline_translation.sql.gz')
    if os.path.exists(translation):
        db_utils.execute_file(conn, translation)
    base_tables, base_versions = len(db_utils.tables(conn)), db_utils.count(conn, 'sys_schema_version')
    print(f'baseline imported: tables={base_tables}, versions={base_versions}', flush=True)

    logs = args.work_dir
    proc, log = start_app(args.jar, args.port, os.path.join(logs, 'run1.log'), args.timeout, 'run1')
    stop_app(proc, log)
    run1_tables, run1_versions = len(db_utils.tables(conn)), db_utils.count(conn, 'sys_schema_version')

    proc, log = start_app(args.jar, args.port, os.path.join(logs, 'run2.log'), args.timeout, 'run2')
    stop_app(proc, log)
    run2_tables, run2_versions = len(db_utils.tables(conn)), db_utils.count(conn, 'sys_schema_version')
    if (run1_tables, run1_versions) != (run2_tables, run2_versions):
        raise SystemExit(f'二次启动不幂等: run1={run1_tables}/{run1_versions} '
                         f'run2={run2_tables}/{run2_versions}')
    print(f'idempotent: tables={run2_tables}, versions={run2_versions}', flush=True)

    summary = {'database': db_name, 'baseTables': base_tables, 'baseVersions': base_versions,
               'run1Tables': run1_tables, 'run1Versions': run1_versions,
               'run2Tables': run2_tables, 'run2Versions': run2_versions}

    if not args.skip_backup:
        dump = os.path.join(logs, 'baseline-backup.sql.gz')
        manifest_path = os.path.join(logs, 'baseline-backup.manifest.json')
        manifest = db_utils.dump_database(conn, dump, manifest_path)
        print(f'backup: tables={manifest["count"]}, rows={manifest["totalRows"]}, '
              f'size={manifest["sizeBytes"]}', flush=True)
        mismatches = db_utils.restore_database(conn, dump, manifest)
        if mismatches:
            raise SystemExit(f'恢复行数不一致: {mismatches[:10]}')
        print('restore verified: 0 row mismatches', flush=True)
        proc, log = start_app(args.jar, args.port, os.path.join(logs, 'run3.log'), args.timeout, 'run3')
        stop_app(proc, log)
        summary.update({'backupTables': manifest['count'], 'backupRows': manifest['totalRows'],
                        'backupSize': manifest['sizeBytes'], 'restoreMismatches': 0,
                        'run3Ready': True})

    summary_path = os.path.join(logs, 'summary.json')
    with open(summary_path, 'w', encoding='utf-8') as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)
    conn.close()
    print('SUMMARY ' + json.dumps(summary, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
