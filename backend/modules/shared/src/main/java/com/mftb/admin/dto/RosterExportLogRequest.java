package com.mftb.admin.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 花名册导出留痕请求（前端「當前分頁 / 所選 N 行」两档导出的审计登记）。
 * <p>只允许声明「范围」与「本次屏幕上/勾选的 id」，**不允许自报人数或筛选条件**：
 * 人数与可见性一律由服务端按组织数据范围重新判定，否则留痕就成了前端想写什么就写什么的日志。
 */
@Data
public class RosterExportLogRequest {

    /** 导出档位：PAGE（当前分页）/ SELECTION（勾选行） */
    @NotBlank(message = "export scope is required")
    @Size(max = 16, message = "export scope is too long")
    private String scope;

    /** 本次导出的员工 id 列表（服务端会按人员范围过滤后再计数） */
    @Size(max = 5000, message = "too many ids in one export trace")
    private List<Long> userIds;
}
