package com.mftb.admin.config;

/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 语言包镜像 → sys_translation 的同步判定测试。
 * <p>
 * 钉住 2026-11-05 简体中文界面约一半回退英文的那批口径。旧实现「只读繁中 + 只插不更」
 * 造成两个静默后果：新入库字段永远缺 en/zh-CN，改过的文案在库里永远是旧值；
 * 而 zh-CN 没有静态包兜底，库里缺值就直接按回退链掉英文，「翻译统计」页又因为
 * 分母只算库里已有的记录而一路显示 100%，没有任何环节报警。
 * <p>
 * 这里只测 {@link TranslationDataInitializer#planMirrorSync} 这个纯判定函数：
 * 「该插 / 该改 / 该跳过」是风险全部所在，落库动作本身交给 JdbcTemplate。
 */
class TranslationMirrorSyncTest {

    private static final List<String> LANGS = List.of("zh-TW", "en", "zh-CN");

    /** 构造镜像：lang → (fieldKey → 文案)，用 LinkedHashMap 保住顺序（顺序决定 touchedKeys） */
    private static Map<String, Map<String, String>> mirrors(Object... triples) {
        Map<String, Map<String, String>> out = new LinkedHashMap<>();
        for (int i = 0; i < triples.length; i += 3) {
            out.computeIfAbsent((String) triples[i], k -> new LinkedHashMap<>())
                    .put((String) triples[i + 1], (String) triples[i + 2]);
        }
        return out;
    }

    /** 构造库里已有的字段（默认未经工台人工修订） */
    private static Map<String, TranslationDataInitializer.ExistingField> existing(
            long id, String key, String source, Map<String, String> translations) {
        return existing(id, key, source, null, translations);
    }

    /** 构造库里已有的字段，可指定 updated_by 以区分机翻/回写/人工修订 */
    private static Map<String, TranslationDataInitializer.ExistingField> existing(
            long id, String key, String source, String updatedBy, Map<String, String> translations) {
        return Map.of(key, new TranslationDataInitializer.ExistingField(id, key, source, translations, updatedBy));
    }

    @Test
    @DisplayName("库里没有的 key 一次写齐镜像带的三种语言，不再只塞一个繁中")
    void insertsCarryAllMirroredLanguages() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "rdm.colStatus", "狀態",
                        "en", "rdm.colStatus", "Status",
                        "zh-CN", "rdm.colStatus", "状态"),
                Map.of(), LANGS);

        assertEquals(1, plan.inserts().size());
        var inserted = plan.inserts().get(0);
        assertEquals("rdm.colStatus", inserted.fieldKey());
        assertEquals("狀態", inserted.fieldName());
        // 分类取命名空间首段，翻译工作台的分类筛选靠它
        assertEquals("rdm", inserted.category());
        assertEquals(Map.of("zh-TW", "狀態", "en", "Status", "zh-CN", "状态"), inserted.translations());
        assertEquals(List.of("rdm.colStatus"), plan.touchedKeys());
        assertTrue(plan.updates().isEmpty(), "无中生有不该产生 UPDATE");
    }

    @Test
    @DisplayName("镜像自有字段（source=sync 且非菜单）文案漂移必须回填")
    void driftedSyncOwnedFieldIsRewritten() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "asset.colLocationName", "存放倉庫",
                        "zh-CN", "asset.colLocationName", "存放仓库"),
                existing(7L, "asset.colLocationName", "sync",
                        Map.of("zh-TW", "存放位置", "zh-CN", "存放位置", "ja", "保存場所")),
                LANGS);

        assertEquals(1, plan.updates().size());
        var update = plan.updates().get(0);
        assertEquals(7L, update.id());
        assertEquals("存放倉庫", update.translations().get("zh-TW"));
        assertEquals("存放仓库", update.translations().get("zh-CN"));
        // 镜像里没有的语言必须原样保留，否则用户手工/机翻补的日文会被抹成空缺
        assertEquals("保存場所", update.translations().get("ja"));
        assertEquals(List.of("asset.colLocationName"), plan.touchedKeys());
    }

    @Test
    @DisplayName("菜单字段的现有值不许被镜像覆盖，但缺的语言照补")
    void menuFieldKeepsItsOwnValuesButAcceptsBlanks() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "menu.home", "首頁",
                        "en", "menu.home", "Home",
                        "zh-CN", "menu.home", "首页"),
                existing(1L, "menu.home", "sync", Map.of("zh-TW", "主頁", "en", "Main")),
                LANGS);

        assertEquals(1, plan.updates().size());
        Map<String, String> merged = plan.updates().get(0).translations();
        assertEquals("主頁", merged.get("zh-TW"), "menu.* 真源是 sys_menu，镜像不能覆盖已有值");
        assertEquals("Main", merged.get("en"), "同上");
        assertEquals("首页", merged.get("zh-CN"), "原本为空的简中要补上，否则菜单在简中界面回退英文");
    }

    @Test
    @DisplayName("人工登记的字段只补空坑，不盖业务方手工译名")
    void manualFieldIsOnlyFilledWhereBlank() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "biz.clearance", "清倉",
                        "en", "biz.clearance", "Clearance",
                        "zh-CN", "biz.clearance", "清仓"),
                existing(9L, "biz.clearance", "manual", Map.of("zh-TW", "特賣", "en", "Sale")),
                LANGS);

        assertEquals(1, plan.updates().size(), "简中原本为空，属于补空，应写一次");
        Map<String, String> merged = plan.updates().get(0).translations();
        assertEquals("特賣", merged.get("zh-TW"), "manual 的繁中是业务方手工定的，不能盖");
        assertEquals("Sale", merged.get("en"), "manual 的英文同理");
        assertEquals("清仓", merged.get("zh-CN"));
    }

    @Test
    @DisplayName("镜像与库完全一致时不产生任何写入，重启不会反复刷库")
    void identicalStateIsNoop() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "common.add", "新增",
                        "en", "common.add", "Add",
                        "zh-CN", "common.add", "新增"),
                existing(3L, "common.add", "sync",
                        Map.of("zh-TW", "新增", "en", "Add", "zh-CN", "新增")),
                LANGS);

        assertTrue(plan.inserts().isEmpty());
        assertTrue(plan.updates().isEmpty());
        assertTrue(plan.touchedKeys().isEmpty(), "没改动就不该触发机翻");
    }

    @Test
    @DisplayName("繁中为空的 key 不入库，并单独计数提示前端修文案")
    void blankTraditionalValueIsSkipped() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "rdm.daily.unitItem", "",
                        "en", "rdm.daily.unitItem", ""),
                Map.of(), LANGS);

        assertTrue(plan.inserts().isEmpty(), "繁中是回退链最后兜底，空值入库等于造一行空文案");
        assertEquals(1, plan.blankSkipped());
        assertFalse(plan.touchedKeys().contains("rdm.daily.unitItem"));
    }

    @Test
    @DisplayName("镜像缺整份语言包时降级为只同步繁中，不抛异常拖垮启动")
    void missingLanguageMirrorDegradesGracefully() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "hr.colEmpNo", "員工編號"),
                Map.of(), LANGS);

        assertEquals(1, plan.inserts().size());
        assertEquals(Map.of("zh-TW", "員工編號"), plan.inserts().get(0).translations(),
                "en/zh-CN 镜像缺席时不得写出 null 值");
    }

    @Test
    @DisplayName("已存在但繁中被改短的字段，field_name 与截断口径保持一致")
    void fieldNameIsTruncatedToColumnWidth() {
        String long31 = "故".repeat(120);
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "biz.long", long31),
                existing(11L, "biz.long", "sync", Map.of("zh-TW", "旧值")),
                LANGS);

        assertEquals(100, plan.updates().get(0).fieldName().length(), "field_name 列宽 100，超长必须截断");
    }

    @Test
    @DisplayName("工台里人工改过的 sync 字段不得被镜像打回，但缺的语言照补")
    void humanEditedSyncFieldIsNotReverted() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "asset.colStatus", "資產狀態",
                        "en", "asset.colStatus", "Asset Status",
                        "zh-CN", "asset.colStatus", "资产状态"),
                existing(21L, "asset.colStatus", "sync", "张三",
                        Map.of("zh-TW", "狀態（人工改过）", "zh-CN", "状态（人工改过）")),
                LANGS);

        assertEquals(1, plan.updates().size(), "en 原本为空，属于补空，应该写");
        Map<String, String> merged = plan.updates().get(0).translations();
        assertEquals("狀態（人工改过）", merged.get("zh-TW"), "人工修订不能被镜像打回，否则下次启动就消失");
        assertEquals("状态（人工改过）", merged.get("zh-CN"));
        assertEquals("Asset Status", merged.get("en"));
        assertEquals(1, plan.humanProtected());
    }

    @Test
    @DisplayName("机翻回写不算人工修订：updated_by 的前缀才是区分口径")
    void machineWrittenFieldIsStillMirrorOwned() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "asset.colStatus", "資產狀態"),
                existing(22L, "asset.colStatus", "sync", "machine(管理员)", Map.of("zh-TW", "旧机翻")),
                LANGS);

        assertEquals(1, plan.updates().size());
        assertEquals("資產狀態", plan.updates().get(0).translations().get("zh-TW"), "机翻输出可以被镜像修正");
        assertEquals(0, plan.humanProtected());
    }

    @Test
    @DisplayName("updated_by 前缀判定：回写与机翻不算人工，空值不算，人名算")
    void humanEditMarkerRecognition() {
        assertFalse(TranslationDataInitializer.isHumanEdited("machine(null)"));
        assertFalse(TranslationDataInitializer.isHumanEdited("backfill-zh-CN"));
        assertFalse(TranslationDataInitializer.isHumanEdited("i18n-sync"));
        assertFalse(TranslationDataInitializer.isHumanEdited(null));
        assertFalse(TranslationDataInitializer.isHumanEdited("  "));
        assertTrue(TranslationDataInitializer.isHumanEdited("管理员"));
        assertTrue(TranslationDataInitializer.isHumanEdited("  张三  "), "前后空白不应逃避人工判定");
    }

    @Test
    @DisplayName("翻译 JSON 解不开的行整行不动，避免把已有译文当空缺盖掉")
    void unparseableRowIsSkippedEntirely() {
        var plan = TranslationDataInitializer.planMirrorSync(
                mirrors("zh-TW", "asset.colStatus", "狀態", "en", "asset.colStatus", "Status"),
                Map.of("asset.colStatus", new TranslationDataInitializer.ExistingField(
                        31L, "asset.colStatus", "sync", null, "i18n-sync")),
                LANGS);

        // 当成空 Map 会继续写，于是原本存在（只是格式脏）的 ja/ko/ru 被当空缺丢掉，
        // 而原始内容不可追回——比不同步严重得多
        assertTrue(plan.inserts().isEmpty());
        assertTrue(plan.updates().isEmpty());
        assertEquals(1, plan.unparseable());
        assertTrue(plan.touchedKeys().isEmpty());
    }

    @Test
    @DisplayName("分类取自命名空间首段；无点号裸键归 biz；超宽截断到 32")
    void categoryDerivation() {
        assertEquals("asset", TranslationDataInitializer.categoryOf("asset.colLocationName"));
        assertEquals("biz", TranslationDataInitializer.categoryOf("aiAccessApply"));
        String wide = TranslationDataInitializer.categoryOf(
                "verylongnamespacethatarewaytolongforsomething.col");
        assertEquals(32, wide.length(), "category 列宽 32，超长同样要截断");
        assertTrue(wide.startsWith("verylong"), "截断只能从尾部切，不能换内容");
    }
}
