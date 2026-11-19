/*
 * Copyright (c) 2026 fengsong7889. All Rights Reserved.
 *
 * 本文件为「MFTB 企业一体化管理平台软件」后端服务的组成部分，属专有代码。
 * 未经著作权人书面许可，不得使用、复制、修改、再分发或用于任何商业目的。
 * 完整许可条款见仓库根目录 LICENSE 文件。
 */
package com.mftb.admin.service.cpm;

import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.CpmConstants;
import com.mftb.admin.dto.CpmDto;
import com.mftb.admin.entity.CpmReport;
import com.mftb.admin.entity.CpmReportRevision;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.CpmCommentMapper;
import com.mftb.admin.mapper.CpmRecognitionMapper;
import com.mftb.admin.util.JsonUtils;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Word 导出测试（阶段三）。
 *
 * <p>这里最要紧的一条断言不是「能不能出文件」，而是<b>导出的是冻结的那一版</b>：
 * 如果导出时顺手重新聚合，历史版本的导出件就会随时间一起变，
 * 「他当时拿到的那份文档写了什么」再也回答不了——版本机制在导出这一层失效最难被发现，
 * 因为单看每一次导出都完全正常。
 */
class CpmDocxExportServiceTest {

    private static final SysUser SELF = user(1L, "張偉");
    private static final SysUser OTHER = user(2L, "李強");
    private static final LocalDate START = LocalDate.of(2026, 11, 16);
    private static final LocalDate END = LocalDate.of(2026, 11, 22);

    private CpmAccessGuard guard;
    private CpmReportRevisionService revisionService;
    private CpmCommentMapper commentMapper;
    private CpmRecognitionMapper recognitionMapper;
    private CpmDocxExportService service;

    @BeforeEach
    void setUp() {
        guard = mock(CpmAccessGuard.class);
        revisionService = mock(CpmReportRevisionService.class);
        commentMapper = mock(CpmCommentMapper.class);
        recognitionMapper = mock(CpmRecognitionMapper.class);
        service = new CpmDocxExportService(guard, revisionService, commentMapper, recognitionMapper);
        when(guard.currentUser()).thenReturn(SELF);
        when(commentMapper.listThreadLite(CpmConstants.TARGET_REPORT, 12L)).thenReturn(List.of());
        when(recognitionMapper.listArchive(anyLong())).thenReturn(List.of());
    }

    private static SysUser user(long id, String name) {
        SysUser user = new SysUser();
        user.setId(id);
        user.setName(name);
        user.setUsername("MF000" + id);
        return user;
    }

    private static CpmDto.Snapshot snapshot(int total, int done, int minutes, String entryTitle) {
        CpmDto.Snapshot snapshot = new CpmDto.Snapshot();
        snapshot.setPeriodType("week");
        snapshot.setPeriodStart(START.toString());
        snapshot.setPeriodEnd(END.toString());
        CpmDto.Snapshot.Totals totals = snapshot.getTotals();
        totals.setTotal(total);
        totals.setDone(done);
        totals.setCancelled(1);
        CpmDto.Snapshot.Group group = new CpmDto.Snapshot.Group();
        group.setCategory("develop");
        group.setCategoryLabel("開發");
        group.setMinutes(minutes);
        CpmDto.Snapshot.Entry entry = new CpmDto.Snapshot.Entry();
        entry.setItemId(1L);
        entry.setTitle(entryTitle);
        entry.setStatus(CpmConstants.STATUS_DONE);
        entry.setProgress(100);
        entry.setMinutes(minutes);
        entry.setMinutesSource("segment");
        group.getItems().add(entry);
        snapshot.getGroups().add(group);
        // 快照的 time 刻意不给默认值：null 是「阶段二的旧快照没有工时维度」的如实表达，
        // 默认给一个空对象会让导出把「没记录」写成「0 小时」
        CpmDto.Snapshot.TimeTotals time = new CpmDto.Snapshot.TimeTotals();
        time.setTotalMinutes(minutes);
        time.setPreciseMinutes(minutes);
        time.setActiveDays(minutes > 0 ? 1 : 0);
        time.setAvgMinutesPerActiveDay(minutes);
        snapshot.setTime(time);
        return snapshot;
    }

    private static CpmReport report(String status, CpmDto.Snapshot snapshot) {
        CpmReport report = new CpmReport();
        report.setId(12L);
        report.setUserId(SELF.getId());
        report.setPeriodType("week");
        report.setPeriodStart(START);
        report.setPeriodEnd(END);
        report.setStatus(status);
        report.setContentJson(JsonUtils.toJson(snapshot));
        report.setSummary("本週完成一件事");
        report.setAiSummary(0);
        report.setPublishedAt(LocalDateTime.of(2026, 11, 18, 20, 0));
        report.setPublishedRevisionId(22L);
        return report;
    }

    /** 把导出的字节读回成文档文本：断言「文件里真的写了什么」比断言「没抛异常」有内容得多 */
    private static String textOf(byte[] docx) throws Exception {
        StringBuilder text = new StringBuilder();
        try (XWPFDocument document = new XWPFDocument(new ByteArrayInputStream(docx))) {
            document.getParagraphs().forEach(p -> text.append(p.getText()).append('\n'));
            document.getTables().forEach(table -> table.getRows().forEach(row ->
                    row.getTableCells().forEach(cell -> text.append(cell.getText()).append(' '))));
        }
        return text.toString();
    }

    @Test
    @DisplayName("已发布汇报能导出，文件里含周期标题、工时汇总与事项明细（所见即所导）")
    void publishedReportExportsDocument() throws Exception {
        CpmDto.Snapshot snapshot = snapshot(1, 1, 90, "完成計價引擎");
        when(guard.requireReadableReport(12L, SELF)).thenReturn(
                report(CpmConstants.REPORT_STATUS_PUBLISHED, snapshot));
        when(revisionService.list(eq(12L), eq(22L))).thenReturn(List.of(revisionVo(2, true)));

        CpmDocxExportService.ExportedFile file = service.export(12L, null);

        assertEquals("cpm-report-week-2026-11-16-v2.docx", file.fileName());
        String text = textOf(file.content());
        assertTrue(text.contains("工作匯報"), "标题要在，否则文件本身没有辨识度");
        assertTrue(text.contains("完成計價引擎"), "明细必须落进文件，不能只出一张封面");
        assertTrue(text.contains("開發"), "分类词表随快照带出，不让界面二次翻译");
        assertTrue(text.contains("1.5h"), "工时汇总进导出件：导出文本要等于页面文本");
        assertTrue(text.contains("V2"), "版本号是这份文件可追溯的唯一标识");
    }

    @Test
    @DisplayName("草稿不可导出：草稿内容随时在变，一份没有版本号的汇报件流出去就无法判断它是哪一版")
    void draftCannotBeExported() {
        when(guard.requireReadableReport(12L, SELF)).thenReturn(
                report(CpmConstants.REPORT_STATUS_DRAFT, snapshot(1, 0, 0, "草稿事項")));

        BusinessException error = assertThrows(BusinessException.class, () -> service.export(12L, null));
        assertTrue(error.getMessage().contains("草稿"));
    }

    @Test
    @DisplayName("指定版本时导出的是那一版冻结内容，而不是当前版（历史导出件不能随时间一起变）")
    void specificRevisionExportsFrozenContent() throws Exception {
        CpmDto.Snapshot current = snapshot(1, 1, 90, "当前版事項");
        CpmDto.Snapshot first = snapshot(1, 0, 60, "第一版事項");
        when(guard.requireReadableReport(12L, SELF)).thenReturn(
                report(CpmConstants.REPORT_STATUS_PUBLISHED, current));
        CpmReportRevision revision = new CpmReportRevision();
        revision.setRevisionNo(1);
        revision.setPublishedAt(LocalDateTime.of(2026, 11, 17, 9, 0));
        revision.setDigest("第一版摘要");
        revision.setAiSummary(0);
        revision.setDocumentSnapshot(JsonUtils.toJson(first));
        when(revisionService.require(12L, 1)).thenReturn(revision);
        when(revisionService.parseSnapshot(revision)).thenReturn(first);

        CpmDocxExportService.ExportedFile file = service.export(12L, 1);

        assertEquals("cpm-report-week-2026-11-16-v1.docx", file.fileName());
        String text = textOf(file.content());
        assertTrue(text.contains("第一版事項"), "导出内容取自那一版的冻结快照");
        assertTrue(!text.contains("当前版事項"), "绝不能把当前版内容装进历史版本的文件里");
        assertTrue(text.contains("2026-11-17 09:00"));
    }

    @Test
    @DisplayName("阶段二遗留的已发布记录（无版本行）导出时如实标「歷史發送快照」，不伪造 V1")
    void legacyPublishedReportIsNotFakedAsV1() throws Exception {
        CpmReport legacy = report(CpmConstants.REPORT_STATUS_PUBLISHED, snapshot(1, 1, 60, "舊事項"));
        legacy.setPublishedRevisionId(null);
        when(guard.requireReadableReport(12L, SELF)).thenReturn(legacy);

        CpmDocxExportService.ExportedFile file = service.export(12L, null);

        assertEquals("cpm-report-week-2026-11-16.docx", file.fileName());
        assertTrue(textOf(file.content()).contains("歷史發送快照"));
    }

    @Test
    @DisplayName("越权访问由可读守卫拒绝，错误文案是权限而不是「文件生成失败」")
    void unauthorizedIsRejectedByGuard() {
        when(guard.requireReadableReport(12L, SELF)).thenThrow(new BusinessException("無權查看該成員的匯報"));

        BusinessException error = assertThrows(BusinessException.class, () -> service.export(12L, null));
        assertEquals("無權查看該成員的匯報", error.getMessage());
    }

    @Test
    @DisplayName("反馈与认定一并导出，且只取既有查询的结果（不为导出新增跨人取数路径）")
    void feedbackAndRecognitionAreIncluded() throws Exception {
        when(guard.requireReadableReport(12L, SELF)).thenReturn(
                report(CpmConstants.REPORT_STATUS_PUBLISHED, snapshot(1, 1, 60, "事項")));
        when(commentMapper.listThreadLite(CpmConstants.TARGET_REPORT, 12L)).thenReturn(List.of(
                Map.of("authorName", "李強", "created_at", "2026-11-18 21:00", "content", "方案很清楚")));
        when(recognitionMapper.listArchive(SELF.getId())).thenReturn(List.of(Map.of(
                "target_type", CpmConstants.TARGET_REPORT, "target_id", "12",
                "from_name", "李強", "kind", "milestone", "comment", "作為新的說明類基準",
                "created_at", "2026-11-18 21:05")));
        when(revisionService.list(eq(12L), eq(22L))).thenReturn(List.of(revisionVo(2, true)));

        String text = textOf(service.export(12L, null).content());

        assertTrue(text.contains("方案很清楚"));
        assertTrue(text.contains("作為新的說明類基準"));
        assertTrue(text.contains("里程碑"), "认定类型要给中文标签，导出件是给人读的");
    }

    @Test
    @DisplayName("别的条目上的认定不会混进本份导出件：筛的是 target_type + target_id 两个条件")
    void otherTargetRecognitionIsFilteredOut() throws Exception {
        when(guard.requireReadableReport(12L, SELF)).thenReturn(
                report(CpmConstants.REPORT_STATUS_PUBLISHED, snapshot(1, 1, 60, "事項")));
        when(recognitionMapper.listArchive(SELF.getId())).thenReturn(List.of(Map.of(
                "target_type", CpmConstants.TARGET_ITEM, "target_id", "99",
                "from_name", "李強", "kind", "highlight", "comment", "彥在條目上的認定",
                "created_at", "2026-11-18 21:05")));
        when(revisionService.list(eq(12L), eq(22L))).thenReturn(List.of(revisionVo(2, true)));

        String text = textOf(service.export(12L, null).content());

        assertTrue(!text.contains("彥在條目上的認定"), "条目上的认定不属于这份汇报的导出件");
    }

    @Test
    @DisplayName("没有工时记录时导出件说明「未記錄」，而不是写一串 0 冒充测量结果")
    void missingTimeSectionSaysNotRecorded() throws Exception {
        CpmDto.Snapshot noTime = snapshot(1, 1, 0, "事項");
        noTime.setTime(null);
        when(guard.requireReadableReport(12L, SELF)).thenReturn(
                report(CpmConstants.REPORT_STATUS_PUBLISHED, noTime));
        when(revisionService.list(eq(12L), eq(22L))).thenReturn(List.of(revisionVo(2, true)));

        String text = textOf(service.export(12L, null).content());

        assertTrue(text.contains("本期未記錄投入時間"));
        assertTrue(!text.contains("總投入：0h"));
    }

    @Test
    @DisplayName("他人汇报被认定后仍按归属人归档查询：导出不因为调用者是谁而换一条 SQL")
    void otherOwnerReportStillUsesOwnerArchive() throws Exception {
        CpmReport other = report(CpmConstants.REPORT_STATUS_PUBLISHED, snapshot(1, 1, 60, "下屬事項"));
        other.setUserId(OTHER.getId());
        when(guard.requireReadableReport(12L, SELF)).thenReturn(other);
        when(guard.userById(OTHER.getId())).thenReturn(OTHER);
        when(revisionService.list(eq(12L), eq(22L))).thenReturn(List.of(revisionVo(2, true)));

        textOf(service.export(12L, null).content());

        // 归档查询按汇报归属人取，而不是按调用者取：换成调用者就会把「我看得到的汇报」
        // 变成「我能看到的认定台账」，披露面被悄悄放大
        verify(recognitionMapper).listArchive(OTHER.getId());
    }

    private static CpmDto.RevisionVO revisionVo(int no, boolean current) {
        CpmDto.RevisionVO vo = new CpmDto.RevisionVO();
        vo.setRevisionNo(no);
        vo.setCurrent(current);
        return vo;
    }
}
