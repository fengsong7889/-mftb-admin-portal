package com.mftb.admin.config;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mftb.admin.dto.MachineTranslateRequest;
import com.mftb.admin.service.TranslationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * 多语言翻译模块初始化器: 启动时幂等创建 sys_language / sys_translation 表并写入种子数据
 * <p>
 * 对应脚本 backend/sql/19_translation.sql;
 * 排在 DataInitializer 之后执行（依赖 sys_menu 已就绪），菜单名自动同步为翻译字段。
 * <p>
 * 启动时自动从 classpath:i18n/&#123;zh-TW,en,zh-CN&#125;.json 读取前端语言包镜像，
 * 幂等同步到 sys_translation 表，确保翻译字段覆盖整个系统，并对新增/变更字段自动触发机翻。
 * 镜像由 {@code npm run i18n:sync-backend} 从前端真源生成，{@code npm run check:i18n-mirror} 在 CI 里拦住漂移。
 */
@Slf4j
@Component
@Order(20)
@RequiredArgsConstructor
public class TranslationDataInitializer implements CommandLineRunner {

    private final JdbcTemplate jdbcTemplate;
    private final TranslationService translationService;
    private final ObjectMapper objectMapper;
    private final SchemaVersionTracker versionTracker;

    /**
     * 语言包镜像里带哪几种语言，与 {@code npm run i18n:sync-backend} 同步的文件名一一对应。
     * <p>zh-CN 也在镜像里，是为了让简体中文不依赖机翻链路：它原先只能靠
     * {@code backfillZhCn()}（一次性版本门）或 MyMemory 配额填充，两者都会在
     * 「同步器补了新 key」之后留下空洞，而 zh-CN 又没有静态包兜底，界面就直接回退英文。
     */
    private static final List<String> MIRRORED_LANGS = List.of("zh-TW", "en", "zh-CN");

    /** 菜单同步字段前缀: 值由 sys_menu 决定, 不接受语言包镜像覆盖 */
    private static final String MENU_KEY_PREFIX = "menu.";

    /** 繁中是全站文案的源语言，也是机翻的源，不能当成「待补的目标语言」 */
    private static final String SOURCE_LANG = "zh-TW";

    /** 自动机翻开关：离线/无外网环境可以关掉，避免每次启动都在后台重试外部 API */
    @org.springframework.beans.factory.annotation.Value("${translation.auto-mt.enabled:true}")
    private boolean autoMtEnabled;

    /**
     * 单轮递交的缺口字段上限。
     * <p>不设上限等于每台开发机启动都往 MyMemory 刷一轮全表缺口；设上限 + 按 id 升序，
     * 既单轮可控，又能多轮收敛。
     */
    @org.springframework.beans.factory.annotation.Value("${translation.auto-mt.batch-limit:2000}")
    private int autoMtBatchLimit;

    @Override
    public void run(String... args) {
        log.info("多语言翻译模块初始化开始");
        try {
            // 基础建表与默认语言种子: 一次性, 版本化后重启跳过 (启动提速)
            versionTracker.applyOnce("translation:base-v1", () -> {
                createTables();
                seedLanguages();
            });
            // "活"逻辑: 菜单种子化可能新增菜单, 需同步为翻译字段; 增量同步成本极低, 每次执行
            syncMenuNames();
            syncI18nKeys();
            // zh-CN 回填: 将已有 zh-TW 翻译通过 ICU4J 繁→简转换填充缺失的 zh-CN。
            // 不再做一次性版本门：镜像只能覆盖到「前端有同名 key」的字段，
            // sys_menu 新增的 menu.* 与业务方手工登记的 manual 字段必须在这里补上简中，
            // 否则它们会永远停在空缺状态，而 zh-CN 的空缺在 bundle 里直接回退英文。
            // 本步只填空缺、不联网、不碰配额，每次启动重跑的成本是一条全表扫描。
            int filled = translationService.backfillZhCn();
            if (filled > 0) {
                log.info("多语言模块: zh-CN 简体中文回填完成，共填充 {} 条翻译", filled);
            }
            // 机翻补空：必须在回填之后，否则本次刚补上简中的字段会多等一轮
            triggerAutoMachineTranslate();
        } catch (Exception e) {
            log.error("多语言翻译模块初始化失败: {}", e.getMessage(), e);
        }
    }

    /**
     * 启动后台线程补齐「已注册但还没有译文」的语言。
     * <p>异步是为了不阻塞启动；额度吃紧时本轮没翻完的缺口下次启动接着来（见 {@link #selectIdsWithTranslationGap}）。
     */
    private void triggerAutoMachineTranslate() {
        if (!autoMtEnabled) {
            log.info("多语言模块: 自动机翻已关闭（translation.auto-mt.enabled=false），缺口需手工在翻译工作台机翻");
            return;
        }
        List<Long> gapIds = selectIdsWithTranslationGap();
        if (gapIds.isEmpty()) {
            log.info("多语言模块: 各已注册语言均无缺口，无需机翻");
            return;
        }
        List<Long> idsToTranslate = new ArrayList<>(gapIds);
        Thread thread = new Thread(() -> {
            try {
                MachineTranslateRequest req = new MachineTranslateRequest();
                req.setIds(idsToTranslate);
                int done = translationService.machineTranslate(req);
                log.info("多语言模块: 自动机翻本轮完成，填充 {} 条翻译（本轮递交 {} 个字段）", done, idsToTranslate.size());
            } catch (Exception e) {
                log.warn("多语言模块: 自动机翻失败（可稍后手动执行）: {}", e.getMessage());
            }
        }, "i18n-auto-translate");
        thread.setDaemon(true);
        thread.start();
    }

    /**
     * 找出「至少一种已注册目标语言仍为空」的字段 ID，按 id 升序取前 N 条。
     * <p>机翻驱动从旧实现的「只喂本次新增」改成「喂全部缺口」是必须的：MyMemory 匿名日额度只有
     * 5000 字符，一轮启动最多填几百条，只喂新增集合的话，额度耗尽后剩下的缺口就再无人接手
     * （2026-11-06 实测：同步后 ja/ko/ru 停在 51.8%，机翻一条日志都没留下）。
     * <p>按 id 升序 + 限量，让每次启动从上次的断点继续，收敛是单调的。
     */
    private List<Long> selectIdsWithTranslationGap() {
        List<String> targets = jdbcTemplate.queryForList(
                "SELECT code FROM sys_language WHERE status = 1 AND deleted = 0 ORDER BY id",
                String.class);
        // 繁中是机翻的源语言，不是目标；把它当缺口会造成死循环（永远填不上也永远在名单里）
        targets.remove(SOURCE_LANG);
        if (targets.isEmpty()) {
            return new ArrayList<>();
        }
        List<Long> gapIds = new ArrayList<>();
        List<TranslationSnapshot> snapshots = jdbcTemplate.query(
                "SELECT id, translations_json FROM sys_translation ORDER BY id",
                (java.sql.ResultSet rs, int rowNum) -> new TranslationSnapshot(
                        rs.getLong("id"), readTranslations(rs.getString("translations_json"))));
        for (TranslationSnapshot snapshot : snapshots) {
            if (gapIds.size() >= autoMtBatchLimit) {
                break;
            }
            // 解不开的行不递交机翻：服务层同样读不了它，只会把整批带倒
            if (snapshot.translations() == null) {
                continue;
            }
            for (String lang : targets) {
                if (!StringUtils.hasText(snapshot.translations().get(lang))) {
                    gapIds.add(snapshot.id());
                    break;
                }
            }
        }
        if (gapIds.size() >= autoMtBatchLimit) {
            log.info("多语言模块: 本轮只递交前 {} 个缺口字段（单轮上限 {}，可调 translation.auto-mt.batch-limit）",
                    gapIds.size(), autoMtBatchLimit);
        }
        return gapIds;
    }

    private void createTables() {
        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_language ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "code VARCHAR(16) NOT NULL COMMENT '语言代码 ISO 639-1', "
                        + "native_name VARCHAR(100) NOT NULL COMMENT '母语名称', "
                        + "flag VARCHAR(16) DEFAULT '🌐' COMMENT '国旗 Emoji', "
                        + "names_json TEXT NULL COMMENT '各系统语言下的显示名 JSON', "
                        + "status INT DEFAULT 1 COMMENT '状态: 1=启用 0=停用', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_lang_code (code)"
                        + ") COMMENT='多语言配置-已注册语言表'");

        jdbcTemplate.execute(
                "CREATE TABLE IF NOT EXISTS sys_translation ("
                        + "id BIGINT AUTO_INCREMENT PRIMARY KEY, "
                        + "field_key VARCHAR(128) NOT NULL COMMENT '字段Key, 全局唯一', "
                        + "field_name VARCHAR(100) NOT NULL COMMENT '字段名称（业务识别用，允许重复）', "
                        + "category VARCHAR(32) DEFAULT 'biz' COMMENT '分类: common/status/action/menu/biz/ui', "
                        + "translations_json TEXT NULL COMMENT '翻译 JSON', "
                        + "source VARCHAR(16) DEFAULT 'manual' COMMENT '来源: manual/sync', "
                        + "updated_by VARCHAR(64) NULL COMMENT '最后更新人', "
                        + "deleted INT DEFAULT 0 COMMENT '逻辑删除', "
                        + "created_at DATETIME DEFAULT CURRENT_TIMESTAMP, "
                        + "updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, "
                        + "UNIQUE KEY uk_field_key (field_key)"
                        + ") COMMENT='多语言配置-翻译字段表'");

        // 配置表已改为物理删除: 清理历史逻辑删除残留行, 避免其重新可见并占用唯一键
        jdbcTemplate.update("DELETE FROM sys_language WHERE deleted <> 0");
        jdbcTemplate.update("DELETE FROM sys_translation WHERE deleted <> 0");
    }

    /** 默认 5 语言种子（仅插入不存在的） */
    private void seedLanguages() {
        String[][] seeds = {
                {"zh-TW", "繁體中文", "🇨🇳", "{\"zh-TW\":\"繁中\",\"en\":\"Chinese\",\"ja\":\"中国語\",\"ko\":\"중국어\",\"ru\":\"Китайский\"}"},
                {"en", "English", "🇺🇸", "{\"zh-TW\":\"英文\",\"en\":\"English\",\"ja\":\"英語\",\"ko\":\"영어\",\"ru\":\"Английский\"}"},
                {"ja", "日本語", "🇯🇵", "{\"zh-TW\":\"日文\",\"en\":\"Japanese\",\"ja\":\"日本語\",\"ko\":\"일본어\",\"ru\":\"Японский\"}"},
                {"ko", "한국어", "🇰🇷", "{\"zh-TW\":\"韓文\",\"en\":\"Korean\",\"ja\":\"韓国語\",\"ko\":\"한국어\",\"ru\":\"Корейский\"}"},
                {"ru", "Русский", "🇷🇺", "{\"zh-TW\":\"俄文\",\"en\":\"Russian\",\"ja\":\"ロシア語\",\"ko\":\"러시아어\",\"ru\":\"Русский\"}"},
        };
        int created = 0;
        for (String[] s : seeds) {
            Integer count = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM sys_language WHERE code = ? AND deleted = 0", Integer.class, s[0]);
            if (count != null && count > 0) {
                continue;
            }
            jdbcTemplate.update(
                    "INSERT INTO sys_language (code, native_name, flag, names_json, status) VALUES (?, ?, ?, ?, 1)",
                    s[0], s[1], s[2], s[3]);
            created++;
        }
        if (created > 0) {
            log.info("多语言模块: 已写入 {} 个默认语言", created);
        }
    }

    /** 菜单名自动同步为翻译字段（category=menu，从 sys_menu 的 name/name_en 生成，仅插入不存在的） */
    private void syncMenuNames() {
        int synced = jdbcTemplate.update(
                "INSERT INTO sys_translation (field_key, field_name, category, translations_json, source) "
                        + "SELECT CONCAT('menu.', m.menu_key), m.name, 'menu', "
                        + "CONCAT('{\"zh-TW\":\"', "
                        + "REPLACE(REPLACE(IFNULL(m.name, ''), '\\\\', '\\\\\\\\'), '\"', '\\\\\"'), "
                        + "'\",\"en\":\"', "
                        + "REPLACE(REPLACE(IFNULL(m.name_en, ''), '\\\\', '\\\\\\\\'), '\"', '\\\\\"'), "
                        + "'\"}'), 'sync' "
                        + "FROM sys_menu m "
                        + "WHERE m.deleted = 0 AND m.menu_key IS NOT NULL AND m.menu_key <> '' "
                        + "AND NOT EXISTS (SELECT 1 FROM sys_translation t WHERE t.field_key = CONCAT('menu.', m.menu_key))");
        if (synced > 0) {
            log.info("多语言模块: 已自动同步 {} 个菜单名称为翻译字段", synced);
        }
    }

    /**
     * 从 classpath:i18n/&#123;zh-TW,en,zh-CN&#125;.json 读取前端语言包镜像，幂等同步到 sys_translation。
     * <p>与旧实现的两处差别（旧行为是 2026-11-05 简体中文界面约一半回退英文的根因）：
     * <ol>
     *   <li>旧实现只读 zh-TW.json，新入库的字段只有繁中一个语言，en/zh-CN 全靠后续机翻补；
     *       现在按镜像一次写齐 zh-TW/en/zh-CN，机翻只需补 ja/ko/ru。</li>
     *   <li>旧实现「只插不更」，前端改过文案的 key 在库里永远停在旧值（实测 167 条漂移）；
     *       现在对 {@code source='sync'} 且非菜单的字段按镜像回填，其余字段只补该语言原本为空的坑。
     *       人工登记字段（{@code source='manual'}）、菜单字段（{@code menu.*}）与工台里人工修订过的
     *       字段（{@code updated_by} 不带机翻/回写/同步前缀）的现有值一律不动：
     *       前者是业务方手工译名，中者的真源是 sys_menu，后者是已经人工校对的译文。</li>
     * </ol>
     * <p>本方法只负责把镜像灌进库里；ja/ko/ru 等镜像里没有的语言由
     * {@link #triggerAutoMachineTranslate()} 按「全表缺口」驱动，不依赖本方法的返回值。
     */
    private void syncI18nKeys() {
        Map<String, Map<String, String>> mirrors = new LinkedHashMap<>();
        for (String lang : MIRRORED_LANGS) {
            Map<String, String> flat = readLocaleMirror(lang);
            if (!flat.isEmpty()) {
                mirrors.put(lang, flat);
            }
        }
        Map<String, String> zhTw = mirrors.get("zh-TW");
        if (zhTw == null || zhTw.isEmpty()) {
            log.warn("多语言模块: classpath:i18n/zh-TW.json 不存在或为空，跳过 i18n 字段同步");
            return;
        }

        // 一次性取现有字段，避免逐条检查
        Map<String, ExistingField> existing = new HashMap<>();
        for (ExistingField field : jdbcTemplate.query(
                "SELECT id, field_key, source, translations_json, updated_by FROM sys_translation",
                (java.sql.ResultSet rs, int rowNum) -> new ExistingField(
                        rs.getLong("id"), rs.getString("field_key"), rs.getString("source"),
                        readTranslations(rs.getString("translations_json")), rs.getString("updated_by")))) {
            existing.put(field.fieldKey(), field);
        }

        SyncPlan plan = planMirrorSync(mirrors, existing, MIRRORED_LANGS);

        if (!plan.inserts().isEmpty()) {
            // 分批而不是整批一条语句：16k 个 key 一次拼出单条 multi-value INSERT 会撞 max_allowed_packet
            // （开发库实测单批 8040 行已跑过 5 分钟，生产 RDS 上同一句式体积更大）
            List<Object[]> rows = plan.inserts().stream()
                    .map(i -> new Object[]{i.fieldKey(), i.fieldName(), i.category(), writeTranslationsJson(i.translations())})
                    .toList();
            for (List<Object[]> chunk : chunked(rows, WRITE_CHUNK)) {
                jdbcTemplate.batchUpdate(
                        "INSERT INTO sys_translation (field_key, field_name, category, translations_json, source) VALUES (?, ?, ?, ?, 'sync')",
                        chunk);
            }
            log.info("多语言模块: 已从语言包镜像同步 {} 个新字段到翻译表（镜像共 {} 个键）", rows.size(), zhTw.size());
        }
        if (!plan.updates().isEmpty()) {
            // 同样分批：逐条 update 等于 N 次往返，开发库实测 6400 条要跑几分钟，
            // 而这一步卡在启动期会拖长就绪探针 503 的时间窗口
            List<Object[]> rows = plan.updates().stream()
                    // 镜像里没有的语言（ja/ko/ru）保持原值，只刷新镜像带的这几种
                    .map(u -> new Object[]{writeTranslationsJson(u.translations()), u.fieldName(), "i18n-sync", u.id()})
                    .toList();
            for (List<Object[]> chunk : chunked(rows, WRITE_CHUNK)) {
                jdbcTemplate.batchUpdate(
                        "UPDATE sys_translation SET translations_json = ?, field_name = ?, updated_by = ? WHERE id = ?",
                        chunk);
            }
            log.info("多语言模块: 已按语言包镜像修正 {} 个已入库字段的文案（含漂移回填与补空）", plan.updates().size());
        }
        if (plan.blankSkipped() > 0) {
            log.warn("多语言模块: 语言包镜像有 {} 个 key 的繁中值为空，本次不入库", plan.blankSkipped());
        }
        if (plan.humanProtected() > 0) {
            log.info("多语言模块: {} 个字段保留工台人工修订（不取镜像值）", plan.humanProtected());
        }
        if (plan.unparseable() > 0) {
            log.warn("多语言模块: {} 个字段的 translations_json 无法解析，本轮整行不动（需人工修数据）", plan.unparseable());
        }
        log.info("多语言模块: 本轮 i18n 字段同步完毕，新增 {} / 修正 {} / 触碰 {} / 跳过空繁中 {}",
                plan.inserts().size(), plan.updates().size(), plan.touchedKeys().size(), plan.blankSkipped());
    }

    /** 单批写入行数上限：兼顾网络往返与语句包大小 */
    private static final int WRITE_CHUNK = 500;

    /** 列表分片（不拷贝尾部多余元素） */
    private static <T> List<List<T>> chunked(List<T> source, int size) {
        List<List<T>> out = new ArrayList<>();
        for (int i = 0; i < source.size(); i += size) {
            out.add(source.subList(i, Math.min(source.size(), i + size)));
        }
        return out;
    }

    /**
     * 比对语言包镜像与已入库字段，得出「该插什么 / 该改什么 / 该跳过什么」。
     * <p>单独拆成无副作用的静态方法是为了可测：这段判定同时背三个约束
     * （镜像自有要回填、manual 与菜单不能盖值、其余只补空），全部藏在 JdbcTemplate 里就无法用单测钉住。
     * <p>判定口径：
     * <ul>
     *   <li>库里没有 → 插入，把镜像带的几种语言一次写齐；</li>
     *   <li>{@code source='sync'} 且非 {@code menu.*}、且最后一次写入不是工台人工修订（镜像自有）
     *       → 镜像值与库值不同就改；</li>
     *   <li>其余（manual / menu.* / 人工修订过的 sync）→ 只在「该语言原本为空」时补，有值就让位；</li>
     *   <li>繁中为空的 key 不入库：繁中是回退链的最后兜底，写进去等于往库里产一行空文案。</li>
     * </ul>
     */
    static SyncPlan planMirrorSync(Map<String, Map<String, String>> mirrors,
                                   Map<String, ExistingField> existing,
                                   List<String> langs) {
        Map<String, String> zhTw = mirrors.getOrDefault("zh-TW", Map.of());
        List<SyncInsert> inserts = new ArrayList<>();
        List<SyncUpdate> updates = new ArrayList<>();
        List<String> touchedKeys = new ArrayList<>();
        int blankSkipped = 0;
        int humanProtected = 0;
        int unparseable = 0;
        for (Map.Entry<String, String> entry : zhTw.entrySet()) {
            String fieldKey = entry.getKey();
            String zhTwValue = entry.getValue();
            if (!StringUtils.hasText(zhTwValue)) {
                blankSkipped++;
                continue;
            }
            ExistingField found = existing.get(fieldKey);
            if (found == null) {
                Map<String, String> translations = new LinkedHashMap<>();
                for (String lang : langs) {
                    String value = mirrors.getOrDefault(lang, Map.of()).get(fieldKey);
                    if (StringUtils.hasText(value)) {
                        translations.put(lang, value);
                    }
                }
                inserts.add(new SyncInsert(fieldKey, truncate(zhTwValue, 100), categoryOf(fieldKey), translations));
                touchedKeys.add(fieldKey);
                continue;
            }
            // 翻译 JSON 解不开的行整行不动：当成空 Map 会让镜像盖掉其实已存在的其他语言译文
            if (found.translations() == null) {
                unparseable++;
                continue;
            }
            // manual 是业务方手工译名、menu.* 的真源是 sys_menu，两者的现有文案都不许被镜像覆盖；
            // sync 字段如果在工台里被人改过（updated_by 是不带任何前缀的操作人名）也不得回盖，
            // 因为「工台里改了、下次启动被镜像打回去」会比不同步更难排查
            boolean humanEdited = isHumanEdited(found.updatedBy());
            if (humanEdited) {
                humanProtected++;
            }
            boolean ownedByMirror = "sync".equals(found.source())
                    && !fieldKey.startsWith(MENU_KEY_PREFIX) && !humanEdited;
            Map<String, String> merged = new LinkedHashMap<>(found.translations());
            boolean changed = false;
            for (String lang : langs) {
                String value = mirrors.getOrDefault(lang, Map.of()).get(fieldKey);
                if (!StringUtils.hasText(value)) {
                    continue;
                }
                if (ownedByMirror || !StringUtils.hasText(merged.get(lang))) {
                    if (!value.equals(merged.get(lang))) {
                        merged.put(lang, value);
                        changed = true;
                    }
                }
            }
            if (!changed) {
                continue;
            }
            updates.add(new SyncUpdate(found.id(), fieldKey, truncate(zhTwValue, 100), merged));
            touchedKeys.add(fieldKey);
        }
        return new SyncPlan(inserts, updates, touchedKeys, blankSkipped, humanProtected, unparseable);
    }

    /**
     * 判断一条字段是否被翻译工台人工修订过。
     * <p>机翻写 {@code machine(人名)}（{@code TranslationServiceImpl#machineTranslate}）、
     * 繁转简回填写 {@code backfill-zh-CN}、镜像同步写 {@code i18n-sync}；
     * 剩下的非空且不带前缀的名字只可能是工台里的 {@code update()} 写入，即人工译名。
     */
    static boolean isHumanEdited(String updatedBy) {
        if (!StringUtils.hasText(updatedBy)) {
            return false;
        }
        String value = updatedBy.trim();
        return !value.startsWith("machine(")
                && !"backfill-zh-CN".equals(value)
                && !"i18n-sync".equals(value);
    }

    /** 已入库字段的判定快照 */
    record ExistingField(long id, String fieldKey, String source, Map<String, String> translations, String updatedBy) {
    }

    /** 待插入字段（尚未入库，无 id） */
    record SyncInsert(String fieldKey, String fieldName, String category, Map<String, String> translations) {
    }

    /** 待修正的已入库字段 */
    record SyncUpdate(long id, String fieldKey, String fieldName, Map<String, String> translations) {
    }

    /** 一轮镜像同步的完整计划 */
    record SyncPlan(List<SyncInsert> inserts, List<SyncUpdate> updates, List<String> touchedKeys,
                    int blankSkipped, int humanProtected, int unparseable) {
    }

    /** 字段现有译文的快照，用于判定哪些语言还空着 */
    record TranslationSnapshot(long id, Map<String, String> translations) {
    }

    /** 递归展平嵌套 Map 为点分隔键 */
    @SuppressWarnings("unchecked")
    private void flattenMap(String prefix, Map<String, Object> map, Map<String, String> result) {
        for (Map.Entry<String, Object> entry : map.entrySet()) {
            String key = prefix.isEmpty() ? entry.getKey() : prefix + "." + entry.getKey();
            Object value = entry.getValue();
            if (value instanceof Map) {
                flattenMap(key, (Map<String, Object>) value, result);
            } else if (value != null) {
                result.put(key, value.toString());
            }
        }
    }

    /** 读取并展平一份语言包镜像；不存在或解析失败返回空 Map，由调用方按「该语言不参与同步」降级 */
    private Map<String, String> readLocaleMirror(String lang) {
        ClassPathResource resource = new ClassPathResource("i18n/" + lang + ".json");
        if (!resource.exists()) {
            log.warn("多语言模块: classpath:i18n/{}.json 不存在，该语言不参与字段同步", lang);
            return new LinkedHashMap<>();
        }
        Map<String, String> flatMap = new LinkedHashMap<>();
        try (InputStream is = resource.getInputStream()) {
            String json = new String(is.readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});
            flattenMap("", root, flatMap);
        } catch (Exception e) {
            log.warn("多语言模块: 读取 i18n/{}.json 失败: {}", lang, e.getMessage());
            return new LinkedHashMap<>();
        }
        return flatMap;
    }

    /** 分类取 key 的首个命名空间（与旧实现同口径，翻译工作台的分类筛选与统计靠它） */
    static String categoryOf(String fieldKey) {
        int dot = fieldKey.indexOf('.');
        return truncate(dot > 0 ? fieldKey.substring(0, dot) : "biz", 32);
    }

    /**
     * 已入库翻译 JSON 解析。
     * <p>区分三种情况：空值返空 Map；能解析返可用 Map；非空但解不开返 {@code null}。
     * 不能把解不开当成空 Map 继续同步：那会让镜像把已有（只是格式脏）的 ja/ko/ru 当作空缺盖掉，
     * 造成无人察觉的静默丢译；标记后上层会整行跳过并记警告。
     */
    private Map<String, String> readTranslations(String json) {
        if (!StringUtils.hasText(json)) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, String>>() {});
        } catch (Exception e) {
            return null;
        }
    }

    /** 翻译 Map 序列化为 JSON；失败必须抛出，否则会往库里写空文案 */
    private String writeTranslationsJson(Map<String, String> translations) {
        try {
            return objectMapper.writeValueAsString(translations);
        } catch (Exception e) {
            throw new IllegalStateException("序列化翻译 JSON 失败", e);
        }
    }

    /** 截断字符串至指定长度 */
    static String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }
}
