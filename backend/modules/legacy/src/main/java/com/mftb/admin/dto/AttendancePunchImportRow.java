package com.mftb.admin.dto;

import lombok.Data;

/**
 * 打卡导入行（前端解析 Excel/CSV 后提交，后端只做校验与入库）。
 * <p>
 * 不在后端解析二进制文件：解析规则（列顺序、表头）由导入向导承担，
 * 后端只认结构化行，避免同一份模板在两处各写一遍解析逻辑。
 */
@Data
public class AttendancePunchImportRow {

    /** 工号 */
    private String empNo;

    /** 打卡时间 yyyy-MM-dd HH:mm:ss */
    private String punchAt;

    /** 1=上班卡 2=下班卡 */
    private Integer punchType;

    /** 打卡地点 */
    private String location;
}
