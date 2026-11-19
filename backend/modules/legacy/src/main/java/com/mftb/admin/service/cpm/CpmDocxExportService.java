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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.wp.usermodel.HeaderFooterType;
import org.apache.poi.xwpf.usermodel.ParagraphAlignment;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFFooter;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.apache.poi.xwpf.usermodel.XWPFRun;
import org.apache.poi.xwpf.usermodel.XWPFTable;
import org.apache.poi.xwpf.usermodel.XWPFTableRow;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * 汇报 Word 导出（阶段三）。
 *
 * <p><b>为什么 Word 走服务端而 PDF 走浏览器</b>（方案 §已定版决策 3）：
 * .docx 的价值恰恰在于它是「可再加工的归档件」——上级能批注、HR 能取用，
 * 而字体由打开方渲染，服务端不需要背 CJK 字体。PDF 若要服务端出，必须内嵌中文字体
 * （约 10–16MB 进镜像）并自己实现分页，等于在客户端已经能做对的事上再造一条真源；
 * 会议纪要对同一问题已经给出书面结论（浏览器所见即所得），这里保持同一口径，
 * 两个模块的导出行为也就不会长成分叉。
 *
 * <p><b>导出的必须是冻结快照而不是重新聚合的结果</b>：用户点的是「把这一版给我一份文件」，
 * 如果导出时顺手重算，文件内容就会与刚刚屏幕上看到的那版不一致，
 * 而且历史版本的导出件会随时间一起变——那等于版本机制在导出这一层失效。
 *
 * <p>内容不外泄两条：本文档只包含调用者可见范围内的数据（守卫在 {@code requireReadableReport}）；
 * 全文不写日志——汇报正文是个人工作内容，不是诊断信息。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CpmDocxExportService {

    private static final DateTimeFormatter DISPLAY = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    /** 状态词表：与前端 meta 同一套中文标签。导出件要独立可读，不能只给原始码 */
    private static final Map<String, String> STATUS_LABELS = Map.of(
            CpmConstants.STATUS_TODO, "待辦",
            CpmConstants.STATUS_DOING, "進行中",
            CpmConstants.STATUS_DONE, "已完成",
            CpmConstants.STATUS_BLOCKED, "受阻",
            CpmConstants.STATUS_CANCELLED, "已取消",
            CpmConstants.STATUS_DEFERRED, "延期");

    private final CpmAccessGuard guard;
    private final CpmReportRevisionService revisionService;
    private final CpmCommentMapper commentMapper;
    private final CpmRecognitionMapper recognitionMapper;

    /**
     * 生成 .docx。
     *
     * <p>返回「文件名 + 字节」而不是只有字节：文件名要用汇报的周期与版本号拼，
     * 而这些信息只有在通过可见性守卫、读到汇报本体之后才拿得到。
     * 让控制器再查一次汇报只为凑一个文件名，等于把同一个资源读两遍、守卫判两遍——
     * 两处判定迟早会有一次忘了加。
     *
     * @param reportId   汇报 id
     * @param revisionNo 指定版本；null = 当前生效版本
     */
    public ExportedFile export(long reportId, Integer revisionNo) {
        SysUser viewer = guard.currentUser();
        CpmReport report = guard.requireReadableReport(reportId, viewer);
        if (!CpmConstants.REPORT_STATUS_PUBLISHED.equals(report.getStatus())) {
            // 草稿不可导出：草稿的内容随时在变，一份没有版本号的汇报件流出去，
            // 收的人无法判断它是哪一版，发的人之后还能改——这正是版本机制要消灭的情形
            throw new BusinessException("草稿尚不可導出，請先發布");
        }

        CpmDto.Snapshot snapshot;
        String summary;
        boolean aiSummary;
        Integer revisionFor;
        LocalDateTime publishedAt;
        if (revisionNo != null) {
            CpmReportRevision revision = revisionService.require(reportId, revisionNo);
            snapshot = revisionService.parseSnapshot(revision);
            summary = revision.getDigest();
            aiSummary = Integer.valueOf(1).equals(revision.getAiSummary());
            revisionFor = revision.getRevisionNo();
            publishedAt = revision.getPublishedAt();
        } else {
            snapshot = com.mftb.admin.util.JsonUtils.parse(report.getContentJson(), CpmDto.Snapshot.class);
            if (snapshot == null) {
                throw new BusinessException("匯報內容無法解析，請聯繫管理員");
            }
            summary = report.getSummary();
            aiSummary = Integer.valueOf(1).equals(report.getAiSummary());
            revisionFor = currentRevisionNo(report);
            publishedAt = report.getPublishedAt();
        }

        SysUser owner = report.getUserId().equals(viewer.getId()) ? viewer : guard.userById(report.getUserId());
        try (XWPFDocument document = new XWPFDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            writeTitle(document, snapshot, owner, report, revisionFor, publishedAt);
            writeTimeSection(document, snapshot);
            writeDetailSection(document, snapshot);
            writeSummarySection(document, summary, aiSummary);
            writeFeedbackSection(document, reportId, report.getUserId());
            writeFooter(document, revisionFor);
            document.write(out);
            return new ExportedFile(fileName(report, revisionFor), out.toByteArray());
        } catch (IOException e) {
            // 内存流写入失败属于运行时故障；对外只给一句可行动的话，不外泄堆栈
            log.warn("cpm 匯報導出docx失敗 reportId={}: {}", reportId, e.toString());
            throw new BusinessException("導出失敗，請稍後重試");
        }
    }

    /**
     * 导出产物：文件名 + 字节。
     *
     * <p>文件名只用 ASCII 与业务编号（周期类型/期初/版本号），不把中文标题塞进 Content-Disposition：
     * 中文名要靠 RFC 5987 的 {@code filename*=UTF-8''} 才能跨浏览器稳定，控制器负责那层编码，
     * 这里给出的部分在任何浏览器都不会被截断成乱码。
     */
    public record ExportedFile(String fileName, byte[] content) { }

    /** 业务文件名：ASCII 安全，可逆地带上「哪一期、哪一版」，归档后仍能对上号。 */
    private static String fileName(CpmReport report, Integer revisionNo) {
        return "cpm-report-" + report.getPeriodType() + "-" + report.getPeriodStart()
                + (revisionNo == null ? "" : "-v" + revisionNo) + ".docx";
    }

    /* ==================== 各区块 ==================== */

    private Integer currentRevisionNo(CpmReport report) {
        if (report.getPublishedRevisionId() == null) {
            return null;
        }
        for (CpmDto.RevisionVO vo : revisionService.list(report.getId(), report.getPublishedRevisionId())) {
            if (Boolean.TRUE.equals(vo.getCurrent())) {
                return vo.getRevisionNo();
            }
        }
        return null;
    }

    private void writeTitle(XWPFDocument document, CpmDto.Snapshot snapshot, SysUser owner,
                            CpmReport report, Integer revisionNo, LocalDateTime publishedAt) {
        XWPFParagraph title = document.createParagraph();
        title.setAlignment(ParagraphAlignment.CENTER);
        run(title, "工作匯報（" + periodLabel(snapshot) + "）", true, 18);

        XWPFParagraph identity = document.createParagraph();
        identity.setAlignment(ParagraphAlignment.CENTER);
        run(identity, "匯報人：" + nullToEmpty(owner == null ? null : owner.getName())
                + "（" + nullToEmpty(owner == null ? null : owner.getUsername()) + "）", false, 10);
        run(identity, "　週期：" + snapshot.getPeriodStart() + " ~ " + snapshot.getPeriodEnd(), false, 10);
        run(identity, "　發布：" + (publishedAt == null ? "—" : publishedAt.format(DISPLAY)), false, 10);
        // 遗留发布没有版本行：导出件必须如实说「歷史發送快照」，伪造一个 V1 会让这份文件开始说谎
        run(identity, "　版本：" + (revisionNo == null ? "歷史發送快照" : "V" + revisionNo), false, 10);
    }

    private void writeTimeSection(XWPFDocument document, CpmDto.Snapshot snapshot) {
        heading(document, "一、工時投入匯總");
        CpmDto.Snapshot.TimeTotals time = snapshot.getTime();
        if (time == null || time.getTotalMinutes() <= 0) {
            // 空态与零值分开说：没有记录投入时间 ≠ 本期没有工作，把前者写成后者是误导
            paragraph(document, "本期未記錄投入時間。可在「我的工作記錄」行內「記時」補上起止時間後重新發布。");
            return;
        }
        table(document, new String[]{"指標", "數值"}, List.of(
                new String[]{"總投入", formatHours(time.getTotalMinutes())},
                new String[]{"精確記時", formatHours(time.getPreciseMinutes())},
                new String[]{"手工估算", formatHours(time.getManualFallbackMinutes())},
                new String[]{"日均投入（按有投入 " + time.getActiveDays() + " 天）",
                        formatHours(time.getAvgMinutesPerActiveDay())},
                new String[]{"單日峰值", time.getPeakDate() == null ? "—"
                        : time.getPeakDate() + "　" + formatHours(time.getPeakMinutes())}));
        if (!time.getByCategory().isEmpty()) {
            heading3(document, "時間分配（按分類）");
            table(document, new String[]{"分類", "投入", "占比"}, time.getByCategory().stream()
                    .map(row -> new String[]{nullToEmpty(row.getCategoryLabel()),
                            formatHours(row.getMinutes() == null ? 0 : row.getMinutes().intValue()),
                            percent(row.getMinutes(), time.getTotalMinutes())})
                    .toList());
        }
        if (!time.getTopItems().isEmpty()) {
            heading3(document, "事項時間投入成本（Top " + time.getTopItems().size() + "）");
            table(document, new String[]{"事項", "投入", "占比"}, time.getTopItems().stream()
                    .map(row -> new String[]{nullToEmpty(row.getTitle()),
                            formatHours(row.getMinutes() == null ? 0 : row.getMinutes().intValue()),
                            percent(row.getMinutes(), time.getTotalMinutes())})
                    .toList());
        }
        note(document, "日均分母為「有投入的天數」；帶「估算」的數值沒有精確起止，精度低一檔，兩類數據在統計中分列呈現。");
    }

    private void writeDetailSection(XWPFDocument document, CpmDto.Snapshot snapshot) {
        heading(document, "二、工作事項明細");
        CpmDto.Snapshot.Totals totals = snapshot.getTotals();
        paragraph(document, "共 " + totals.getTotal() + " 項：已完成 " + totals.getDone()
                + "、進行中 " + totals.getDoing() + "、待辦 " + totals.getTodo()
                + "、受阻 " + totals.getBlocked() + "、延期 " + totals.getDeferred()
                + "、已取消 " + totals.getCancelled() + "。");
        for (CpmDto.Snapshot.Group group : snapshot.getGroups()) {
            heading3(document, group.getCategoryLabel() + "（" + group.getItems().size() + " 項"
                    + (group.getMinutes() == null || group.getMinutes() <= 0 ? "" : " · " + formatHours(group.getMinutes()))
                    + "）");
            table(document, new String[]{"事項", "狀態", "進度", "投入", "軌跡"},
                    group.getItems().stream().map(entry -> new String[]{
                            nullToEmpty(entry.getTitle()),
                            STATUS_LABELS.getOrDefault(entry.getStatus(), nullToEmpty(entry.getStatus())),
                            entry.getProgress() + "%",
                            entry.getMinutes() == null ? "—" : formatHours(entry.getMinutes()),
                            entry.getTrail() == null || entry.getTrail().size() < 2
                                    ? "—" : joinTrail(entry.getTrail()),
                    }).toList());
        }
    }

    private void writeSummarySection(XWPFDocument document, String summary, boolean aiSummary) {
        heading(document, "三、匯總摘要");
        if (aiSummary) {
            paragraph(document, "【AI 生成】以下摘要由模型起草並經本人確認；所有數字與狀態均来自工作記錄，模型不參與計數。");
        }
        if (summary == null || summary.isBlank()) {
            paragraph(document, "本報告未填寫匯總摘要。");
            return;
        }
        paragraph(document, summary);
    }

    /** 反馈与认定同样只导出「调用者看得到的」那部分：不额外查询他人不可见内容。 */
    private void writeFeedbackSection(XWPFDocument document, long reportId, long ownerId) {
        heading(document, "四、反饋與成果認定");
        List<Map<String, Object>> comments = commentMapper.listThreadLite(CpmConstants.TARGET_REPORT, reportId);
        if (comments.isEmpty()) {
            paragraph(document, "本期尚無反饋評論。");
        } else {
            table(document, new String[]{"反饋人", "時間", "內容"}, comments.stream().map(row -> new String[]{
                    nullToEmpty(str(row.get("authorName"))),
                    nullToEmpty(str(row.get("created_at"))),
                    nullToEmpty(str(row.get("content")))}).toList());
        }
        // 认定复用「本人成果档案」那条既有查询再筛本份：不为导出新增一条没有守卫的跨人 SQL
        List<Map<String, Object>> onThisReport = recognitionMapper.listArchive(ownerId).stream()
                .filter(row -> CpmConstants.TARGET_REPORT.equals(str(row.get("target_type")))
                        && String.valueOf(reportId).equals(str(row.get("target_id"))))
                .toList();
        if (onThisReport.isEmpty()) {
            paragraph(document, "本期尚無成果認定。");
        } else {
            heading3(document, "成果認定（" + onThisReport.size() + " 條）");
            table(document, new String[]{"認定人", "類型", "說明", "時間"}, onThisReport.stream().map(row -> new String[]{
                    nullToEmpty(str(row.get("from_name"))),
                    "milestone".equals(str(row.get("kind"))) ? "里程碑" : "亮點",
                    nullToEmpty(str(row.get("comment"))),
                    nullToEmpty(str(row.get("created_at")))}).toList());
        }
    }

    private void writeFooter(XWPFDocument document, Integer revisionNo) {
        // POI 5.x 的 createFooter 要求显式给出 HeaderFooterType：DEFAULT 才是 Word 打开即生效的那一页脚，
        // 不传类型会编不过，传 EVEN/FIRST 又会让奇偶页只有一页有说明
        XWPFFooter footer = document.createFooter(HeaderFooterType.DEFAULT);
        XWPFParagraph paragraph = footer.createParagraph();
        paragraph.setAlignment(ParagraphAlignment.CENTER);
        run(paragraph, "由「持續績效系統」於 " + LocalDateTime.now().format(DISPLAY)
                + " 生成 · " + (revisionNo == null ? "歷史發送快照" : "正式版本 V" + revisionNo)
                + " · 條目按 itemId 去重，狀態取期間內最後一筆進度流水", false, 8);
    }

    /* ==================== 排版小工具 ==================== */

    private void heading(XWPFDocument document, String text) {
        XWPFParagraph paragraph = document.createParagraph();
        paragraph.setSpacingBefore(240);
        run(paragraph, text, true, 13);
    }

    private void heading3(XWPFDocument document, String text) {
        XWPFParagraph paragraph = document.createParagraph();
        run(paragraph, text, true, 11);
    }

    private void paragraph(XWPFDocument document, String text) {
        run(document.createParagraph(), text, false, 11);
    }

    private void note(XWPFDocument document, String text) {
        XWPFParagraph paragraph = document.createParagraph();
        paragraph.setSpacingBefore(120);
        run(paragraph, "註：" + text, false, 9);
    }

    private void run(XWPFParagraph paragraph, String text, boolean bold, int size) {
        XWPFRun run = paragraph.createRun();
        run.setText(text);
        run.setBold(bold);
        run.setFontSize(size);
    }

    /** 两列/多列表格：表头加粗。POI 的表格 API 对空行不友好，这里保证至少一行数据。 */
    private void table(XWPFDocument document, String[] headers, List<String[]> rows) {
        XWPFTable table = document.createTable(rows.size() + 1, headers.length);
        XWPFTableRow headerRow = table.getRow(0);
        for (int i = 0; i < headers.length; i++) {
            XWPFParagraph cell = headerRow.getCell(i).getParagraphArray(0) == null
                    ? headerRow.getCell(i).addParagraph() : headerRow.getCell(i).getParagraphArray(0);
            run(cell, headers[i], true, 10);
        }
        for (int r = 0; r < rows.size(); r++) {
            XWPFTableRow row = table.getRow(r + 1);
            String[] values = rows.get(r);
            for (int c = 0; c < headers.length; c++) {
                XWPFParagraph cell = row.getCell(c).getParagraphArray(0) == null
                        ? row.getCell(c).addParagraph() : row.getCell(c).getParagraphArray(0);
                run(cell, c < values.length ? values[c] : "", false, 10);
            }
        }
    }

    /* ==================== 格式化 ==================== */

    private static String periodLabel(CpmDto.Snapshot snapshot) {
        return switch (snapshot.getPeriodType() == null ? "" : snapshot.getPeriodType()) {
            case CpmConstants.PERIOD_WEEK -> "週報";
            case CpmConstants.PERIOD_MONTH -> "月報";
            case CpmConstants.PERIOD_QUARTER -> "季度報告";
            default -> snapshot.getPeriodType();
        };
    }

    /** 分钟 → 小时数：与界面同一换算（DECIMAL(4,1) 精度），两处小数位不同就会互相觉得对方算错 */
    private static String formatHours(Integer minutes) {
        if (minutes == null || minutes <= 0) {
            return "0h";
        }
        return java.math.BigDecimal.valueOf(minutes)
                .divide(java.math.BigDecimal.valueOf(60), 1, java.math.RoundingMode.HALF_UP)
                .stripTrailingZeros().toPlainString() + "h";
    }

    private static String percent(Long part, int whole) {
        if (part == null || whole <= 0) {
            return "0%";
        }
        return Math.round(part * 100d / whole) + "%";
    }

    private static String joinTrail(List<Integer> trail) {
        StringBuilder text = new StringBuilder();
        for (Integer value : trail) {
            if (text.length() > 0) {
                text.append(" → ");
            }
            text.append(value).append('%');
        }
        return text.toString();
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
