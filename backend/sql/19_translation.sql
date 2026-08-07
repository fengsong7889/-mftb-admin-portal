-- ============================================================
-- MFTB 搜广推系统 - 多语言翻译管理模块
-- sys_language   : 已注册语言表（代码/母语名/国旗/各系统语言显示名）
-- sys_translation: 翻译字段表（field_key 全局唯一 + 多语言 JSON）
-- 首次启动时 TranslationDataInitializer 会自动完成等效建表与种子, 本脚本供手动执行参考
-- 注意: 两张配置表采用物理删除（deleted 列保留恒为 0）,
--       避免逻辑删除行占用唯一键导致删除后重建/启动同步冲突
-- ============================================================

-- 1. 已注册语言表
CREATE TABLE IF NOT EXISTS sys_language (
    id          BIGINT AUTO_INCREMENT PRIMARY KEY,
    code        VARCHAR(16)  NOT NULL COMMENT '语言代码 ISO 639-1, 如 zh-TW/en/ja/th',
    native_name VARCHAR(100) NOT NULL COMMENT '母语名称, 如 日本語/ภาษาไทย',
    flag        VARCHAR(16)  DEFAULT '🌐' COMMENT '国旗 Emoji',
    names_json  TEXT         NULL COMMENT '各系统语言下的显示名 JSON, 如 {"zh-TW":"日文","en":"Japanese"}',
    status      INT          DEFAULT 1 COMMENT '状态: 1=启用 0=停用',
    deleted     INT          DEFAULT 0 COMMENT '逻辑删除',
    created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_lang_code (code)
) COMMENT='多语言配置-已注册语言表';

-- 2. 翻译字段表（唯一翻译源：UI 文案/菜单名/状态值/业务术语统一存放）
CREATE TABLE IF NOT EXISTS sys_translation (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    field_key         VARCHAR(128) NOT NULL COMMENT '字段Key, 全局唯一, 如 common.add / biz.coupon / menu.home',
    field_name        VARCHAR(100) NOT NULL COMMENT '字段名称（业务人员识别用，允许重复）',
    category          VARCHAR(32)  DEFAULT 'biz' COMMENT '分类: common/status/action/menu/biz/ui',
    translations_json TEXT         NULL COMMENT '翻译 JSON: {"zh-TW":"新增","en":"Add","ja":"追加"}',
    source            VARCHAR(16)  DEFAULT 'manual' COMMENT '来源: manual=手动新增 sync=系统同步',
    updated_by        VARCHAR(64)  NULL COMMENT '最后更新人',
    deleted           INT          DEFAULT 0 COMMENT '逻辑删除',
    created_at        DATETIME     DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_field_key (field_key)
) COMMENT='多语言配置-翻译字段表';

-- 3. 默认语言种子（仅插入不存在的）
INSERT INTO sys_language (code, native_name, flag, names_json)
SELECT * FROM (
    SELECT 'zh-TW' AS code, '繁體中文' AS native_name, '🇨🇳' AS flag, '{"zh-TW":"繁中","en":"Chinese","ja":"中国語","ko":"중국어","ru":"Китайский"}' AS names_json UNION ALL
    SELECT 'en', 'English', '🇺🇸', '{"zh-TW":"英文","en":"English","ja":"英語","ko":"영어","ru":"Английский"}' UNION ALL
    SELECT 'ja', '日本語', '🇯🇵', '{"zh-TW":"日文","en":"Japanese","ja":"日本語","ko":"일본어","ru":"Японский"}' UNION ALL
    SELECT 'ko', '한국어', '🇰🇷', '{"zh-TW":"韓文","en":"Korean","ja":"韓国語","ko":"한국어","ru":"Корейский"}' UNION ALL
    SELECT 'ru', 'Русский', '🇷🇺', '{"zh-TW":"俄文","en":"Russian","ja":"ロシア語","ko":"러시아어","ru":"Русский"}'
) seed WHERE NOT EXISTS (SELECT 1 FROM sys_language l WHERE l.code = seed.code);

-- 4. 菜单名称自动同步为翻译字段（category=menu，从 sys_menu 的 name/name_en 生成）
--    JSON 拼接先转义反斜杠再转义双引号, 保证菜单名含特殊字符时仍生成合法 JSON
INSERT INTO sys_translation (field_key, field_name, category, translations_json, source)
SELECT CONCAT('menu.', m.menu_key), m.name, 'menu',
       CONCAT('{"zh-TW":"', REPLACE(REPLACE(IFNULL(m.name, ''), '\\', '\\\\'), '"', '\\"'),
              '","en":"', REPLACE(REPLACE(IFNULL(m.name_en, ''), '\\', '\\\\'), '"', '\\"'), '"}'),
       'sync'
FROM sys_menu m
WHERE m.deleted = 0 AND m.menu_key IS NOT NULL AND m.menu_key <> ''
  AND NOT EXISTS (SELECT 1 FROM sys_translation t WHERE t.field_key = CONCAT('menu.', m.menu_key));
