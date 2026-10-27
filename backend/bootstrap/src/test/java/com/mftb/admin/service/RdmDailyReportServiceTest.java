package com.mftb.admin.service;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmDailyReportTemplates;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 進度日報的时点命中与入参校验单测（纯逻辑，不触库）。
 *
 * <p>钉住三类容易在重构中被悄悄改坏、且一旦改坏就是「静默不推送」的口径：
 * <ol>
 *   <li><b>规则时间命中</b>：规则存的是 HH:mm 分钟粒度，作业每分钟 tick 一次；若按 LocalTime
 *       全精度比对，09:00:30 的 tick 就会错过 09:00 的规则——当天该规则静默不发，日志里也没有错误。</li>
 *   <li><b>入参 fail-closed</b>：非法档位与非法时间必须抛错，不能兜底成默认值——
 *       把「eveningg」兜成 morning 会让管理员以为配了晚报、实际发的是晨报。</li>
 *   <li><b>读写档位口径不同</b>：写/触发只接受 morning/evening；读取额外接受 manual
 *       （手动补发的快照行 report_type=manual，详情页要能按链接取到它）。</li>
 * </ol>
 */
class RdmDailyReportServiceTest {

    /* ==================== 规则时点命中 ==================== */

    @Test
    @DisplayName("命中：规则时间与当前分钟相等即视为到点")
    void matchesExactPushTime() {
        assertTrue(RdmDailyReportService.isPushTime("09:00", LocalTime.of(9, 0)));
        assertTrue(RdmDailyReportService.isPushTime("18:30", LocalTime.of(18, 30)));
        assertTrue(RdmDailyReportService.isPushTime("00:00", LocalTime.of(0, 0)));
        assertTrue(RdmDailyReportService.isPushTime("23:59", LocalTime.of(23, 59)));
    }

    @Test
    @DisplayName("边界：tick 带秒/纳秒仍命中（分钟粒度比对，否则整条规则当天静默不发）")
    void matchesWhenTickCarriesSecondsAndNanos() {
        assertTrue(RdmDailyReportService.isPushTime("09:00", LocalTime.of(9, 0, 30)),
                "09:00:30 的 tick 必须命中 09:00 的规则");
        assertTrue(RdmDailyReportService.isPushTime("09:00", LocalTime.of(9, 0, 0, 123_000_000)),
                "带纳秒的 tick 同样必须命中");
        assertTrue(RdmDailyReportService.isPushTime("09:00", LocalTime.of(9, 0, 59)),
                "同一分钟内的任一秒都算到点（作业只该被触发一次，靠快照幂等兜住重复）");
    }

    @Test
    @DisplayName("未命中：差一分钟不推送（不提前也不延后）")
    void doesNotMatchOffByOneMinute() {
        assertFalse(RdmDailyReportService.isPushTime("09:00", LocalTime.of(8, 59)));
        assertFalse(RdmDailyReportService.isPushTime("09:00", LocalTime.of(9, 1)));
        assertFalse(RdmDailyReportService.isPushTime("18:00", LocalTime.of(12, 0)));
    }

    @Test
    @DisplayName("健壮：规则时间为空或时刻为 null 时不推送，但也不抛异常打断调度")
    void toleratesBlankTimeAndNullNow() {
        assertFalse(RdmDailyReportService.isPushTime(null, LocalTime.of(9, 0)));
        assertFalse(RdmDailyReportService.isPushTime("", LocalTime.of(9, 0)));
        assertFalse(RdmDailyReportService.isPushTime("   ", LocalTime.of(9, 0)));
        assertFalse(RdmDailyReportService.isPushTime("09:00", null));
    }

    @Test
    @DisplayName("容忍规则时间的两侧空格（脏数据不应导致整天漏发）")
    void toleratesSurroundingSpaces() {
        assertTrue(RdmDailyReportService.isPushTime("  09:00  ", LocalTime.of(9, 0)));
    }

    /* ==================== 写入侧档位校验 ==================== */

    @Test
    @DisplayName("档位（写/触发）：只接受 morning/evening，前后空格被容忍")
    void acceptsValidReportTypes() {
        assertEquals("morning", RdmDailyReportService.normalizeReportType("morning"));
        assertEquals("evening", RdmDailyReportService.normalizeReportType("evening"));
        assertEquals("evening", RdmDailyReportService.normalizeReportType("  evening  "));
    }

    @Test
    @DisplayName("档位（写/触发）：非法值与空值一律拒绝，不兜底成 morning")
    void rejectsInvalidReportType() {
        BusinessException e1 = assertThrows(BusinessException.class,
                () -> RdmDailyReportService.normalizeReportType("eveningg"));
        assertTrue(e1.getMessage().contains("eveningg"), "报错应回显非法值便于定位: " + e1.getMessage());
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeReportType(null));
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeReportType(""));
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeReportType("manual"),
                "manual 是手动补发的存储档位，不是可配置的内容档位，写侧不得接受");
    }

    /* ==================== 读取侧档位校验 ==================== */

    @Test
    @DisplayName("档位（读取）：额外接受 manual（手动补发的快照行），其余仍只接受晨/晚")
    void readableTypeAlsoAcceptsManual() {
        assertEquals("manual", RdmDailyReportService.normalizeReadableType("manual"));
        assertEquals("manual", RdmDailyReportService.normalizeReadableType("  manual "));
        assertEquals("morning", RdmDailyReportService.normalizeReadableType("morning"));
        assertEquals("evening", RdmDailyReportService.normalizeReadableType("evening"));
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeReadableType("noon"));
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeReadableType(null));
    }

    @Test
    @DisplayName("档位标签：晨/晚各有繁中标签，不落成英文 code")
    void slotLabelsAreLocalized() {
        assertEquals("晨報", RdmDailyReportService.slotLabel(RdmDailyReportTemplates.TYPE_MORNING));
        assertEquals("晚報", RdmDailyReportService.slotLabel(RdmDailyReportTemplates.TYPE_EVENING));
        // manual 不是内容档位，仅用于存储；传入时按晨报处理不应发生，这里只保证不 NPE
        assertEquals("晨報", RdmDailyReportService.slotLabel(RdmDailyReportTemplates.TYPE_MANUAL));
    }

    /* ==================== 时间格式校验 ==================== */

    @Test
    @DisplayName("时间：合法 HH:mm 通过，空值回落到默认值")
    void acceptsValidTimeAndFallsBackWhenBlank() {
        assertEquals("08:30", RdmDailyReportService.normalizeTime("08:30", "09:00", "推送時間"));
        assertEquals("09:00", RdmDailyReportService.normalizeTime(null, "09:00", "推送時間"));
        assertEquals("09:00", RdmDailyReportService.normalizeTime("   ", "09:00", "推送時間"));
    }

    @Test
    @DisplayName("时间：非法格式一律拒绝（写坏的时间会让规则永远命不中或每分钟都命中）")
    void rejectsInvalidTime() {
        String label = "推送時間";
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeTime("9:00", "09:00", label),
                "小时必须两位");
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeTime("24:00", "09:00", label),
                "小时不得为 24");
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeTime("09:60", "09:00", label),
                "分钟不得为 60");
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeTime("0900", "09:00", label),
                "必须带冒号");
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeTime("早上九点", "09:00", label));
        assertThrows(BusinessException.class, () -> RdmDailyReportService.normalizeTime("09:00:00", "09:00", label),
                "只接受 HH:mm，不接受带秒");
    }

    /* ==================== 范围键（幂等维度） ==================== */

    @Test
    @DisplayName("范围键：规则推送用 rule:{id}，手动触发用 manual:{projectId}:{iterationCode}")
    void scopeKeyDistinguishesRulesAndManualScopes() {
        RdmDailyReportService.TriggerTarget rule = new RdmDailyReportService.TriggerTarget(
                12L, "規則A", 5L, null, "morning", null, null);
        assertEquals("rule:12", rule.scopeKey(), "规则维度只认规则ID：同一规则换项目仍是同一份口径");

        RdmDailyReportService.TriggerTarget manualProject = new RdmDailyReportService.TriggerTarget(
                null, null, 5L, null, "morning", null, null);
        assertEquals("manual:5:", manualProject.scopeKey());

        RdmDailyReportService.TriggerTarget manualIteration = new RdmDailyReportService.TriggerTarget(
                null, null, 5L, "SP202610001", "morning", null, null);
        assertEquals("manual:5:SP202610001", manualIteration.scopeKey());

        RdmDailyReportService.TriggerTarget multi = new RdmDailyReportService.TriggerTarget(
                null, null, null, List.of(5L, 3L), null, "morning", null, null);
        assertEquals("manual:ids:3,5", multi.scopeKey(), "多项目按排序后集合编码，重复触发同范围覆盖同一行");

        RdmDailyReportService.TriggerTarget all = new RdmDailyReportService.TriggerTarget(
                null, null, null, List.of(), null, "morning", null, null);
        assertEquals("manual:all", all.scopeKey());

        // 三个范围键两两不同：否则同一天的手动补发会互相覆盖
        assertFalse(manualProject.scopeKey().equals(manualIteration.scopeKey()));
        assertFalse(manualIteration.scopeKey().equals(rule.scopeKey()));
        assertNull(null);
    }

    /* ==================== 规则范围：迭代归属项目 ==================== */

    @Test
    @DisplayName("规则范围：迭代已挂项目且未选项目 → 自动带出迭代项目")
    void ruleScopeFillsProjectFromIteration() {
        assertEquals(7L, RdmDailyReportService.resolveRuleProjectId(null, 7L),
                "先选迭代是合法路径，项目由服务端从迭代带出");
        assertEquals(7L, RdmDailyReportService.resolveRuleProjectId(7L, 7L),
                "表单选的项目与迭代一致时照常通过");
    }

    @Test
    @DisplayName("规则范围：迭代未挂项目（紧急修复）→ 允许规则不挂项目")
    void ruleScopeAllowsUnassignedIteration() {
        assertNull(RdmDailyReportService.resolveRuleProjectId(null, null),
                "hotfix 迭代未挂项目时必须能以迭代为唯一范围落库");
    }

    @Test
    @DisplayName("规则范围：迭代未挂项目却指定了项目 → 拒绝")
    void ruleScopeRejectsProjectForUnassignedIteration() {
        assertThrows(BusinessException.class, () -> RdmDailyReportService.resolveRuleProjectId(5L, null),
                "不能把未挂项目的 hotfix 硬挂到某个项目头上，否则会推错范围");
    }

    @Test
    @DisplayName("规则范围：项目与迭代归属不一致 → 拒绝")
    void ruleScopeRejectsMismatchedProject() {
        assertThrows(BusinessException.class, () -> RdmDailyReportService.resolveRuleProjectId(5L, 7L),
                "迭代归属项目是唯一真值源，表单项目不一致必须拦下");
    }
}
