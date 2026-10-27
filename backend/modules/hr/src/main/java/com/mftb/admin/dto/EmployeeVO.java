package com.mftb.admin.dto;

import com.mftb.admin.entity.SysUser;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 员工视图对象 (不含密码)
 */
@Data
public class EmployeeVO {

    private Long id;
    private String username;
    private String name;
    private String empId;
    private String role;
    private Long departmentId;
    private String department;
    private Long positionId;
    /** 职位名称(中文) */
    private String position;
    /** 职位名称(英文) */
    private String positionEn;
    /** 职级序列 (M/T/P, 随职位带出) */
    private String sequence;
    /** 职级 (随职位带出) */
    private String jobLevel;
    /** 职等 (R1~R5) */
    private String rank;
    private Integer status;

    /** 在职状态（由职务数据派生：active=在职, resigned=离职） */
    private String employmentStatus;

    // ── 花名册默认列（方案 §5.1） ──
    /*
     * 只由 /employees/roster 与 /roster/export 填充（HrRosterQueryService 批量派生），
     * 下拉与其它入口保持 null：那多一次 as-of + 雇佣期间批查，不该让选个人的接口付这个代价。
     * hireDateSource 必须跟着出列：没有它，「入职日期」就分不清是任职事实、人工确认还是根本没核实。
     */

    /** 雇主法人（该时点生效任职的法人快照） */
    private String employerCompany;

    /** 人员类别 */
    private String employeeCategory;

    /** 工作地点 */
    private String workLocation;

    /** 直属上级（姓名快照） */
    private String directSuperior;

    /** 本次雇佣起点；为 null 表示尚未核实 */
    private java.time.LocalDate hireDate;

    /** 雇佣起点来源：POSITION_RECORD / MANUAL / UNVERIFIED */
    private String hireDateSource;

    /** 试用状态：PROBATION / REGULAR / UNKNOWN（无数据源时不猜） */
    private String probationStatus;

    // 注：个人/证件/通讯等敏感信息（出生日期、身份证号、住址、政治面貌、宗教等）
    // 不在此列表/详情 VO 返回，统一由 GET /employees/{id}/basic-info 单一受控来源提供。

    private List<Long> functionRoleIds;
    private LocalDateTime createdAt;
    /** 最后更新人 */
    private String updatedBy;
    /** 最后更新时间 */
    private LocalDateTime updatedAt;

    public static EmployeeVO from(SysUser user, List<Long> functionRoleIds) {
        EmployeeVO vo = new EmployeeVO();
        vo.setId(user.getId());
        vo.setUsername(user.getUsername());
        vo.setName(user.getName());
        vo.setEmpId(user.getEmpId());
        vo.setRole(user.getRole());
        vo.setDepartmentId(user.getDepartmentId());
        vo.setDepartment(user.getDepartment());
        vo.setPositionId(user.getPositionId());
        vo.setPosition(user.getPosition());
        vo.setPositionEn(user.getPositionEn());
        vo.setSequence(user.getSequence());
        vo.setJobLevel(user.getJobLevel());
        vo.setRank(user.getRank());
        vo.setStatus(user.getStatus());
        vo.setFunctionRoleIds(functionRoleIds);
        vo.setCreatedAt(user.getCreatedAt());
        vo.setUpdatedBy(user.getUpdatedBy());
        vo.setUpdatedAt(user.getUpdatedAt());
        return vo;
    }
}
