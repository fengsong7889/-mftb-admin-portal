package com.mftb.admin.dto;

import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;

/**
 * 系统方案库查询条件。
 *
 * <p>日期一律收 {@code LocalDate}（与 {@code FinBatchQuery} 等既有查询一致），
 * 由服务层展开成当天的起止时刻，避免前端为了闭区间自己拼 23:59:59。
 */
@Data
public class DocSystemPlanQuery {

    /** 标题关键字：同时匹配正文一级标题与文件名。 */
    private String title;

    /** 所属系统（精确值，候选来自 systems()）。 */
    private String systemName;

    /** 方案类型（精确值，候选来自 planTypes()）。 */
    private String planType;

    /** 状态：1=生效、0=停用、null=全部。 */
    private Integer status;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate generatedFrom;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate generatedTo;

    /** 最后更新时间范围（该文档在 git 里最后一次提交的日期）。 */
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate updatedFrom;

    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate updatedTo;

    private int page = 1;

    private int size = 20;
}
