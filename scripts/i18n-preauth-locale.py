#!/usr/bin/env python3
# Copyright (c) 2026 fengsong7889. All Rights Reserved.
# 本文件属专有软件组成部分，未经著作权人书面许可不得使用、复制或再分发。
# 完整许可条款见仓库根目录 LICENSE 文件。
"""未登录可见页面（登录页及其子组件）的多语言静态兜底包生成与校验。

要解决的问题
------------
`/translations/bundle` **需要登录**才能访问，所以登录页的文案只能来自前端静态包。
而 ja/ko/ru 的静态包当初只覆盖了门户文案（各 ~900 key），一条 `login.*` 都没有：
在日语界面下打开登录页，工号、密码、登录按钮整片回退英文。库里的译文其实早就有了
（`sys_translation` 的 login.* 六语齐全），只是没进静态包——这一步不耗机翻额度。

两种模式
--------
    python3 scripts/i18n-preauth-locale.py            # 生成：以库为上游写 locales/{ja,ko,ru}.json
    python3 scripts/i18n-preauth-locale.py --check     # 校验：CI 用，缺就红
    python3 scripts/i18n-preauth-locale.py --keys      # 只打印未登录可见 key 清单

`--check` 是本次真正新增的门禁：任何人给登录页加了新文案而没补外语，CI 会直接指出
是哪个 key 缺哪种语言，而不是等用户截图来问「为什么日语登录页是英文」。
"""
import io
import json
import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
LOCALE_DIR = os.path.join(ROOT, 'frontend', 'packages', 'i18n', 'src', 'i18n', 'locales')
SOURCE_LANG = 'zh-TW'

# 六份静态包：zh-TW 是手写真源，zh-CN 由 ICU4J 生成，en 手写，ja/ko/ru 由本脚本补
ALL_LANGS = ['zh-TW', 'zh-CN', 'en', 'ja', 'ko', 'ru']
# 需要本脚本兜底的三语（zh-TW/en 由人手维护、zh-CN 由 i18n:gen-zhcn 派生）
MT_LANGS = ['ja', 'ko', 'ru']

# 未登录状态下能被渲染的界面。新增免登页面时必须同步登记这里，
# 否则该页又会回到「静态包没覆盖 + 拿不到语言包 = 整页英文」的老路。
PREAUTH_SURFACES = [
    'src/pages/Login',                                        # 登录页本体
    'frontend/packages/ui/src/components/SliderCaptcha',       # 登录失败弹的滑块验证（目录形式）
    'frontend/packages/ui/src/components/GroupLogo.tsx',       # 品牌位（登录页复用）
]

# t('a.b') / tr('a.b') / i18n.t('a.b')；带拼接的动态 key 抓不到，由 --check 的兜底提示负责
REF_RE = re.compile(r"""(?<![A-Za-z0-9_.])(?:tr|i18n\.t|t)\(\s*['"`]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"`]""")


def collect_keys():
    """扫描未登录可见界面，返回排序后的静态 key 清单。"""
    files = []
    for surface in PREAUTH_SURFACES:
        path = os.path.join(ROOT, surface)
        if os.path.isdir(path):
            for root, _dirs, names in os.walk(path):
                for name in names:
                    if name.endswith(('.ts', '.tsx')) and '.test.' not in name:
                        files.append(os.path.join(root, name))
        elif os.path.isfile(path):
            files.append(path)
        else:
            raise SystemExit(f'❌ 未登录界面清单里的路径不存在：{surface}（请修正 PREAUTH_SURFACES）')

    keys = set()
    for path in files:
        text = io.open(path, encoding='utf-8').read()
        text = re.sub(r'/\*[\s\S]*?\*/', '', text)
        text = re.sub(r'\{/\*[\s\S]*?\*/\}', '', text)
        text = re.sub(r'(?m)^\s*//.*$', '', text)
        for match in REF_RE.finditer(text):
            # 跳过 defaultValue 兜底那种 t('k', '文案')：key 本身仍要被检查
            keys.add(match.group(1))
    return sorted(keys)


def read_bundle(lang):
    path = os.path.join(LOCALE_DIR, f'{lang}.json')
    if not os.path.exists(path):
        return {}
    return json.load(io.open(path, encoding='utf-8'))


def lookup(bundle, dotted):
    node = bundle
    for part in dotted.split('.'):
        if not isinstance(node, dict) or part not in node:
            return None
        node = node[part]
    return node if not isinstance(node, (dict, list)) else None


def assign(bundle, dotted, value):
    parts = dotted.split('.')
    node = bundle
    for part in parts[:-1]:
        nxt = node.get(part)
        if not isinstance(nxt, dict):
            nxt = {}
            node[part] = nxt
        node = nxt
    node[parts[-1]] = value


# 库里也没有译文时的手写兜底（仅登录前可见、语义无歧义的安全提示类文案）。
# 这里只允许放「免登界面」的少数条目：登录页只能靠静态包，不能等机翻额度慢慢爬。
# 每条都属待业务复核范围，入库后请在「翻译工作台」确认或修正（库内仍为空，
# 所以覆盖率不会因此虚高）。
MANUAL_TEXTS = {
    'login.captchaRequiredHint': {
        'ja': 'アカウント保護のため、連続でログインに失敗した後は、次回ログイン前にスライダー認証を完了する必要があります',
        'ko': '계정 보호를 위해 연속 로그인 실패 후에는 다음 로그인 시 슬라이더 인증을 먼저 완료해야 합니다',
        'ru': 'В целях безопасности аккаунта после серии неудачных попыток входа нужно сначала пройти проверку слайдером',
    },
    # 品牌读屏标签。库里只有 zh-TW/en/zh-CN（app.logoMain 当年也没被机翻覆盖），
    # 词形直接沿用库里 app.logoMain 已定型的写法：ja/ko 保留拉丁 MFTB，ru 用 МФТБ。
    'app.logoGroup': {
        'ja': 'MFTBグループポータル',
        'ko': 'MFTB 그룹 포털',
        'ru': 'Корпоративный портал МФТБ',
    },
}


def db_translations(keys):
    """从 sys_translation 取这批 key 的既有译文（凭据只走 backend/.env.local，不入库）。"""
    try:
        import pymysql
    except ImportError:
        raise SystemExit('❌ 需要 pymysql（与 npm run i18n:snapshot 同一前提）')

    env = {}
    env_path = os.path.join(ROOT, 'backend', '.env.local')
    if not os.path.exists(env_path):
        raise SystemExit('❌ 缺 backend/.env.local：生成模式需要开发库里的既有译文')
    for line in io.open(env_path, encoding='utf-8'):
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    body = env['DB_URL'].split('?')[0][len('jdbc:mysql://'):]
    hostport, dbname = body.split('/')[0], body.split('/')[1].split('/')[0]
    conn = pymysql.connect(host=hostport.split(':')[0], port=int(hostport.split(':')[1]),
                           user=env['DB_USERNAME'], password=env['DB_PASSWORD'],
                           database=dbname, charset='utf8mb4')
    out = {}
    try:
        with conn.cursor() as cur:
            step = 500
            for i in range(0, len(keys), step):
                chunk = keys[i:i + step]
                placeholders = ','.join(['%s'] * len(chunk))
                # 参数化 IN：key 来自源码文本，仍按不可信输入处理
                cur.execute(
                    f'SELECT field_key, translations_json FROM sys_translation '
                    f'WHERE deleted = 0 AND field_key IN ({placeholders})', chunk)
                for field_key, raw in cur.fetchall():
                    try:
                        out[field_key] = json.loads(raw) if raw else {}
                    except (ValueError, TypeError):
                        out[field_key] = {}
    finally:
        conn.close()
    return out


def write_bundle(lang, bundle):
    path = os.path.join(LOCALE_DIR, f'{lang}.json')
    with io.open(path, 'w', encoding='utf-8') as f:
        json.dump(bundle, f, ensure_ascii=False, indent=2)
        f.write('\n')
    return path


def generate():
    keys = collect_keys()
    print(f'未登录可见 key 共 {len(keys)} 个：{", ".join(keys)}\n')
    db = db_translations(keys)

    zh_tw = read_bundle(SOURCE_LANG)
    missing_source = [k for k in keys if lookup(zh_tw, k) is None]
    if missing_source:
        # 真源里都没有的 key 不属于「补外语」的范围，先让它现形
        print(f'❌ 以下 key 在 zh-TW.json 真源里就不存在（多半是拼接式动态 key）：')
        for k in missing_source:
            print(f'   - {k}')

    total_added = {}
    for lang in MT_LANGS:
        bundle = read_bundle(lang)
        added, updated, pending = 0, 0, []
        for key in keys:
            current = lookup(bundle, key)
            db_value = (db.get(key, {}) or {}).get(lang)
            if isinstance(db_value, str) and db_value.strip():
                desired = db_value
            elif isinstance(current, str) and current.strip():
                # 库里没有但静态包有：保留手写值（门户文案就是这么来的），绝不拿空值盖掉
                continue
            else:
                manual = (MANUAL_TEXTS.get(key) or {}).get(lang)
                if isinstance(manual, str) and manual.strip():
                    desired = manual
                else:
                    pending.append(key)
                    continue
            if current == desired:
                continue
            assign(bundle, key, desired)
            if current is None:
                added += 1
            else:
                updated += 1
                print(f'   • {lang}.json {key}：{current!r} → {desired!r}（跟库内修正）')
        if added or updated:
            write_bundle(lang, bundle)
        total_added[lang] = (added, updated, pending)
        print(f'{lang}.json：新增 {added} 条、跟库修正 {updated} 条；仍缺 {len(pending)} 条 {pending or ""}')

    if any(pending for _, _, pending in total_added.values()):
        print('\n⚠️  上面「仍缺」的 key 在数据库里也没有该语言译文，需要机翻或人工补写；'
              '\n    补齐后重跑一次 npm run i18n:gen-preauth。')
    print('\n本脚本接管的那批免登 key 以数据库为上游：在「翻译工作台」改完 ja/ko/ru 后，')
    print('需要重跑本命令才会在登录页生效（静态包优先级高于数据库语言包）。')
    print('记得接着跑：npm run i18n:sync-backend && npm run i18n:snapshot，然后重启后端。')


def check():
    keys = collect_keys()
    bundles = {lang: read_bundle(lang) for lang in ALL_LANGS}
    problems = []
    for lang in ALL_LANGS:
        if not bundles[lang]:
            problems.append(f'{lang}.json 缺失或为空')
    for key in keys:
        for lang in ALL_LANGS:
            value = lookup(bundles[lang], key)
            if value is None:
                problems.append(f'{lang}.json 缺 {key}')
            elif not str(value).strip():
                problems.append(f'{lang}.json 的 {key} 是空串（i18next 会继续回退英文）')

    print(f'未登录可见 key：{len(keys)} 个 × 六语 = {len(keys) * len(ALL_LANGS)} 项检查')
    if problems:
        print(f'\n❌ 登录页（免登界面）多语言兜底不完整，{len(problems)} 项：')
        for p in problems[:40]:
            print('  -', p)
        if len(problems) > 40:
            print(f'  ...另有 {len(problems) - 40} 项')
        print('\n修法：`npm run i18n:gen-preauth`（从库里取既有译文补进 locales/{ja,ko,ru}.json）；'
              '\n库里也没有的，先补机翻或人工译文。')
        return 1
    print('✅ 免登界面的六语文案在静态包里全部齐备（登录页无需后端即可完整本地化）')
    return 0


def main():
    if '--keys' in sys.argv:
        for key in collect_keys():
            print(key)
        return 0
    if '--check' in sys.argv:
        return check()
    generate()
    return 0


if __name__ == '__main__':
    sys.exit(main())
