package com.mftb.admin.dto;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 资源名册保存请求体（阶段 B-2：纳入/编辑团队成员）。
 *
 * <p>userId 为纳入锚点（一人一条，服务端按 uk_rrm_user upsert）；empNo/userName/dept
 * 由服务端从 sys_user 回填快照，不信任前端传值。roleCodes 为岗位集合（pm/product/dev/
 * designer/qa/ops/pmo），落库序列化为 JSON 数组。status 空则默认 1（纳入）。
 */
@Data
public class RdmResourceMemberDTO {

    /** 名册记录ID（编辑时有值；纳入时可空，服务端按 userId upsert） */
    private Long id;

    /** 员工 sys_user.id（纳入必填） */
    private Long userId;

    /** 岗位角色集合：pm/product/dev/designer/qa/ops/pmo（一人可兼多岗） */
    private List<String> roleCodes;

    /** 每周默认容量（人时）；空则按工作日 8h 推算 */
    private BigDecimal weeklyCapacityHours;

    /** 备注 */
    private String remark;

    /** 状态：1=纳入 0=移出（空默认 1） */
    private Integer status;
}
