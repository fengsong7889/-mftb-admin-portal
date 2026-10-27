package com.mftb.admin.controller;

import com.mftb.admin.annotation.EnsureEmployeeScope;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmergencyContactRequest;
import com.mftb.admin.dto.EmergencyContactVO;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.RosterExportLogRequest;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.EmploymentPeriodVO;
import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.dto.PositionRecordVO;
import com.mftb.admin.dto.ResetPasswordRequest;
import com.mftb.admin.dto.RoleBindingRequest;
import com.mftb.admin.dto.SalaryConfigRequest;
import com.mftb.admin.dto.SalaryConfigVO;
import com.mftb.admin.dto.SalaryDeductionRequest;
import com.mftb.admin.dto.SalaryDeductionVO;
import com.mftb.admin.dto.SalaryIncomeRequest;
import com.mftb.admin.dto.SalaryIncomeVO;
import com.mftb.admin.entity.EmpContract;
import com.mftb.admin.service.EmergencyContactService;
import com.mftb.admin.service.EmployeeContractService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.EmployeeSalaryService;
import com.mftb.admin.service.EmployeeService;
import com.mftb.admin.service.PositionRecordService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 集团员工接口。
 * <p>
 * 权限按「操作权限 × 人员范围 × 字段权限」拆分（方案 §7.3 / §三 P0）：
 * <ul>
 *   <li>人事资料编辑（{@code edit}）不再隐含薪酬、账号与角色授权能力；</li>
 *   <li>薪酬档案（含银行账号）单独 {@code salaryView} / {@code salaryEdit}；</li>
 *   <li>证件号与详细地址默认脱敏，明文走 {@code sensitiveView} 并在服务端留痕；</li>
 *   <li>冻结/重置密码单独 {@code accountEdit}，改功能角色单独 {@code authorize}。</li>
 * </ul>
 * 动作全集与 {@link EmployeeConstants#GRANTABLE_ACTIONS} 同源，落库在 sys_menu.actions；
 * 新增端点若用了没登记的动作，授权中心勾不到，等于普通角色永久 403（考勤域踩过）。
 */
@EnsureEmployeeScope
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;
    private final EmergencyContactService emergencyContactService;
    private final PositionRecordService positionRecordService;
    private final EmployeeSalaryService employeeSalaryService;
    private final EmployeeContractService employeeContractService;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final com.mftb.admin.service.HrAuditService hrAuditService;
    private final com.mftb.admin.service.HrRosterQueryService rosterQueryService;

    /** 分页查询员工 */
    @GetMapping
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<PageResult<EmployeeVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String employmentStatus,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String sequence,
            @RequestParam(required = false) String jobLevel,
            @RequestParam(required = false) String rank,
            @RequestParam(required = false) Long roleId,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAtFrom,
            @RequestParam(required = false) String updatedAtTo) {
        return Result.success(employeeService.list(page, size, keyword, employmentStatus,
                departmentId, sequence, jobLevel, rank, roleId, updatedBy, updatedAtFrom, updatedAtTo, null));
    }

    /**
     * 花名册列表：与上面同一套筛选与派生口径，但按当前登录人的组织数据范围收敛。
     * <p>两个入口共存而不是合一个：{@code GET /employees} 还是 OA/EAM/RDM 的「选个人」下拉数据源，
     * 在那里加收敛会让受限角色在其它模块选不到人（方案 §7.3 的人员范围适用于看名单，不适用于引用一个人）。
     */
    @GetMapping("/roster")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_VIEW)
    public Result<PageResult<EmployeeVO>> roster(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String employmentStatus,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String sequence,
            @RequestParam(required = false) String jobLevel,
            @RequestParam(required = false) String rank,
            @RequestParam(required = false) Long roleId,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAtFrom,
            @RequestParam(required = false) String updatedAtTo) {
        return Result.success(rosterQueryService.roster(page, size, keyword, employmentStatus, departmentId,
                sequence, jobLevel, rank, roleId, updatedBy, updatedAtFrom, updatedAtTo));
    }

    /**
     * 花名册全量导出（当前筛选结果，不是当前页）。
     * <p>单独一个端点、单独一个 {@code export} 动作并落审计：列表能看到与能把整名单带走
     * 是两种风险（方案 §5.1「导出区分当前页/选中项/全部筛选结果，并实施独立授权与审计」）。
     * 取数与列表走同一个 {@link #queryRoster}，保证「看到的」与「导出的」不是两套口径。
     */
    @GetMapping("/roster/export")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EXPORT)
    public Result<java.util.List<EmployeeVO>> rosterExport(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String employmentStatus,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) String sequence,
            @RequestParam(required = false) String jobLevel,
            @RequestParam(required = false) String rank,
            @RequestParam(required = false) Long roleId,
            @RequestParam(required = false) String updatedBy,
            @RequestParam(required = false) String updatedAtFrom,
            @RequestParam(required = false) String updatedAtTo) {
        java.util.List<EmployeeVO> rows = rosterQueryService.rosterForExport(keyword, employmentStatus,
                departmentId, sequence, jobLevel, rank, roleId, updatedBy, updatedAtFrom, updatedAtTo);
        hrAuditService.record(com.mftb.admin.dto.HrAuditEntry.of(
                com.mftb.admin.constant.HrAuditAction.ROSTER_EXPORT, null)
                .detail("導出 " + rows.size() + " 人；篩選=" + describeFilter(keyword,
                        employmentStatus, departmentId, sequence, jobLevel, rank, roleId,
                        updatedBy, updatedAtFrom, updatedAtTo)));
        return Result.success(rows);
    }

    /**
     * 花名册「當前分頁 / 所選行」导出的审计留痕。
     * <p>CSV 仍在浏览器生成（这两档的数据本来就在屏幕上），但**人数与可见性由服务端按
     * 组织数据范围重新判定**，不采信前端自报：否则导出留痕就成了想写多少写多少的日志。
     */
    @PostMapping("/roster/export-trace")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EXPORT)
    public Result<Integer> rosterExportTrace(@Valid @RequestBody RosterExportLogRequest request) {
        return Result.success(rosterQueryService.recordExportTrace(request.getScope(), request.getUserIds()));
    }

    /** 审计里的筛选摘要：只记「用了哪些条件」，不记条件值以外的内容 */
    private static String describeFilter(String keyword, String employmentStatus, Long departmentId,
                                         String sequence, String jobLevel, String rank, Long roleId,
                                         String updatedBy, String updatedAtFrom, String updatedAtTo) {
        java.util.List<String> parts = new java.util.ArrayList<>();
        if (org.springframework.util.StringUtils.hasText(keyword)) parts.add("关键词");
        if (org.springframework.util.StringUtils.hasText(employmentStatus)) parts.add("在职状态=" + employmentStatus);
        if (departmentId != null) parts.add("部门#" + departmentId);
        if (org.springframework.util.StringUtils.hasText(sequence)) parts.add("序列=" + sequence);
        if (org.springframework.util.StringUtils.hasText(jobLevel)) parts.add("职级=" + jobLevel);
        if (org.springframework.util.StringUtils.hasText(rank)) parts.add("职等=" + rank);
        if (roleId != null) parts.add("角色#" + roleId);
        if (org.springframework.util.StringUtils.hasText(updatedBy)) parts.add("更新人=" + updatedBy);
        if (org.springframework.util.StringUtils.hasText(updatedAtFrom) || org.springframework.util.StringUtils.hasText(updatedAtTo)) {
            parts.add("更新时间=" + (updatedAtFrom == null ? "" : updatedAtFrom) + "~" + (updatedAtTo == null ? "" : updatedAtTo));
        }
        return parts.isEmpty() ? "无（全量可见范围）" : String.join(",", parts);
    }

    /** 按 ID 查询单个员工详情（含派生在职状态） */
    @GetMapping("/{id}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<EmployeeVO> getById(@PathVariable Long id) {
        return Result.success(employeeService.getDetail(id));
    }

    /** 新增员工 */
    @PostMapping
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_CREATE)
    public Result<EmployeeVO> create(@Valid @RequestBody EmployeeRequest request) {
        return Result.success("員工創建成功", employeeService.create(request));
    }

    /** 编辑员工（人事资料；带 functionRoleIds 时服务层还会单独校验 authorize） */
    @PutMapping("/{id}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<EmployeeVO> update(@PathVariable Long id, @Valid @RequestBody EmployeeRequest request) {
        return Result.success("員工信息已更新", employeeService.update(id, request));
    }

    /** 重置密码（账号高危操作，与人事编辑分离授权） */
    @PutMapping("/{id}/password")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_ACCOUNT_EDIT)
    public Result<Void> resetPassword(@PathVariable Long id, @Valid @RequestBody ResetPasswordRequest request) {
        employeeService.resetPassword(id, request.getPassword());
        return Result.success();
    }

    /** 启用/停用（账号高危操作） */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_ACCOUNT_EDIT)
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        employeeService.updateStatus(id, status);
        return Result.success();
    }

    /** 功能角色授权（从人事编辑里拆出：编辑档案不等于能给人改权限） */
    @PutMapping("/{id}/roles")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_AUTHORIZE)
    public Result<EmployeeVO> bindRoles(@PathVariable Long id, @Valid @RequestBody RoleBindingRequest request) {
        return Result.success("功能角色已更新", employeeService.bindRoles(id, request.getFunctionRoleIds()));
    }

    /** 删除员工 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_DELETE)
    public Result<Void> delete(@PathVariable Long id) {
        employeeService.delete(id);
        return Result.success();
    }

    // ── 基础信息 ──

    /** 获取基础信息（个人信息 + 证件信息 + 通讯信息 + 账号信息），证件/住址默认脱敏 */
    @GetMapping("/{id}/basic-info")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<Map<String, Object>> getBasicInfo(@PathVariable Long id) {
        return Result.success(employeeService.getBasicInfo(id, false));
    }

    /**
     * 明文查看证件号/住址：单独授权 {@code sensitiveView}，并在服务端留痕。
     * <p>刻意不再复用 edit —— 否则「能改电话号码」就等于「能看全公司身份证号」。
     */
    @GetMapping("/{id}/basic-info/sensitive")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SENSITIVE_VIEW)
    public Result<Map<String, Object>> getBasicInfoSensitive(@PathVariable Long id) {
        return Result.success(employeeService.getBasicInfo(id, true));
    }

    /** 保存个人信息 */
    @PutMapping("/{id}/basic-info/personal")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> savePersonalInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    /** 保存证件信息 */
    @PutMapping("/{id}/basic-info/id-info")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> saveIdInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    /** 保存通讯信息 */
    @PutMapping("/{id}/basic-info/contact")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> saveContactInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    /** 保存账号信息（钉钉用户ID等三方通讯/邮箱账号绑定） */
    @PutMapping("/{id}/basic-info/account")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> saveAccountInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    // ── 紧急联系人 ──

    /** 紧急联系人列表 */
    @GetMapping("/{id}/emergency-contacts")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<List<EmergencyContactVO>> listEmergencyContacts(@PathVariable Long id) {
        return Result.success(emergencyContactService.listByUserId(id));
    }

    /** 新增紧急联系人 */
    @PostMapping("/{id}/emergency-contacts")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<EmergencyContactVO> createEmergencyContact(@PathVariable Long id,
                                                             @Valid @RequestBody EmergencyContactRequest request) {
        return Result.success("緊急聯繫人已添加", emergencyContactService.create(id, request));
    }

    /** 编辑紧急联系人 */
    @PutMapping("/{id}/emergency-contacts/{contactId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<EmergencyContactVO> updateEmergencyContact(@PathVariable Long id,
                                                              @PathVariable Long contactId,
                                                              @Valid @RequestBody EmergencyContactRequest request) {
        return Result.success("緊急聯繫人已更新", emergencyContactService.update(id, contactId, request));
    }

    /** 删除紧急联系人 */
    @DeleteMapping("/{id}/emergency-contacts/{contactId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> deleteEmergencyContact(@PathVariable Long id, @PathVariable Long contactId) {
        emergencyContactService.delete(id, contactId);
        return Result.success();
    }

    // ── 职务记录 ──

    /** 职务记录列表（按生效日与同日序号倒序） */
    @GetMapping("/{id}/position-records")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<List<PositionRecordVO>> listPositionRecords(@PathVariable Long id) {
        return Result.success(positionRecordService.listByUserId(id));
    }

    /**
     * 雇佣期间列表（一人多段，按 periodSeq 升序）。
     * <p>双轨期间它是旁路展示数据（列表/详情的部门职位仍取 sys_user 投影），
     * 入参只用于定位人，服务层会再校验员工存在。
     */
    @GetMapping("/{id}/employment-periods")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<List<EmploymentPeriodVO>> listEmploymentPeriods(@PathVariable Long id) {
        return Result.success(employmentPeriodService.listByUser(id).stream()
                .map(EmploymentPeriodVO::from)
                .toList());
    }

    /** 新增职务记录（自动生成 effectiveSeq） */
    @PostMapping("/{id}/position-records")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<PositionRecordVO> createPositionRecord(@PathVariable Long id,
                                                          @Valid @RequestBody PositionRecordRequest request) {
        return Result.success("職務記錄已添加", positionRecordService.create(id, request));
    }

    /** 编辑职务记录（effectiveSeq +1） */
    @PutMapping("/{id}/position-records/{recordId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<PositionRecordVO> updatePositionRecord(@PathVariable Long id,
                                                          @PathVariable Long recordId,
                                                          @Valid @RequestBody PositionRecordRequest request) {
        return Result.success("職務記錄已更新", positionRecordService.update(id, recordId, request));
    }

    /** 删除职务记录 */
    @DeleteMapping("/{id}/position-records/{recordId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> deletePositionRecord(@PathVariable Long id, @PathVariable Long recordId) {
        positionRecordService.delete(id, recordId);
        return Result.success();
    }

    // ── 薪酬档案（独立授权：含银行账号等金融资料，不与普通人事资料共用 view/edit） ──

    /** 收入项列表 */
    @GetMapping("/{id}/salary/incomes")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_VIEW)
    public Result<List<SalaryIncomeVO>> listSalaryIncomes(@PathVariable Long id) {
        return Result.success(employeeSalaryService.listIncomes(id));
    }

    /** 新增收入项 */
    @PostMapping("/{id}/salary/incomes")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<SalaryIncomeVO> createSalaryIncome(@PathVariable Long id,
                                                      @Valid @RequestBody SalaryIncomeRequest request) {
        return Result.success("收入項已添加", employeeSalaryService.createIncome(id, request));
    }

    /** 编辑收入项 */
    @PutMapping("/{id}/salary/incomes/{incomeId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<SalaryIncomeVO> updateSalaryIncome(@PathVariable Long id,
                                                      @PathVariable Long incomeId,
                                                      @Valid @RequestBody SalaryIncomeRequest request) {
        return Result.success("收入項已更新", employeeSalaryService.updateIncome(id, incomeId, request));
    }

    /** 删除收入项 */
    @DeleteMapping("/{id}/salary/incomes/{incomeId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<Void> deleteSalaryIncome(@PathVariable Long id, @PathVariable Long incomeId) {
        employeeSalaryService.deleteIncome(id, incomeId);
        return Result.success();
    }

    /** 扣除项列表 */
    @GetMapping("/{id}/salary/deductions")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_VIEW)
    public Result<List<SalaryDeductionVO>> listSalaryDeductions(@PathVariable Long id) {
        return Result.success(employeeSalaryService.listDeductions(id));
    }

    /** 新增扣除项 */
    @PostMapping("/{id}/salary/deductions")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<SalaryDeductionVO> createSalaryDeduction(@PathVariable Long id,
                                                            @Valid @RequestBody SalaryDeductionRequest request) {
        return Result.success("扣除項已添加", employeeSalaryService.createDeduction(id, request));
    }

    /** 编辑扣除项 */
    @PutMapping("/{id}/salary/deductions/{deductionId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<SalaryDeductionVO> updateSalaryDeduction(@PathVariable Long id,
                                                            @PathVariable Long deductionId,
                                                            @Valid @RequestBody SalaryDeductionRequest request) {
        return Result.success("扣除項已更新", employeeSalaryService.updateDeduction(id, deductionId, request));
    }

    /** 删除扣除项 */
    @DeleteMapping("/{id}/salary/deductions/{deductionId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<Void> deleteSalaryDeduction(@PathVariable Long id, @PathVariable Long deductionId) {
        employeeSalaryService.deleteDeduction(id, deductionId);
        return Result.success();
    }

    /** 获取薪资配置 */
    @GetMapping("/{id}/salary/config")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_VIEW)
    public Result<SalaryConfigVO> getSalaryConfig(@PathVariable Long id) {
        return Result.success(employeeSalaryService.getConfig(id));
    }

    /** 保存薪资配置（存在则更新，不存在则新建） */
    @PutMapping("/{id}/salary/config")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_SALARY_EDIT)
    public Result<SalaryConfigVO> saveSalaryConfig(@PathVariable Long id,
                                                    @Valid @RequestBody SalaryConfigRequest request) {
        return Result.success("薪資配置已更新", employeeSalaryService.saveConfig(id, request));
    }

    // ── 合同台账 (P1-B) ──

    /** 合同列表 */
    @GetMapping("/{id}/contracts")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE)
    public Result<List<EmpContract>> listContracts(@PathVariable Long id) {
        return Result.success(employeeContractService.listByUserId(id));
    }

    /** 新增合同 */
    @PostMapping("/{id}/contracts")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<EmpContract> createContract(@PathVariable Long id, @RequestBody EmpContract contract) {
        return Result.success("合同已新增", employeeContractService.create(id, contract));
    }

    /** 编辑合同 */
    @PutMapping("/{id}/contracts/{contractId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<EmpContract> updateContract(@PathVariable Long id, @PathVariable Long contractId,
                                              @RequestBody EmpContract contract) {
        return Result.success("合同已更新", employeeContractService.update(id, contractId, contract));
    }

    /** 删除合同 */
    @DeleteMapping("/{id}/contracts/{contractId}")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Void> deleteContract(@PathVariable Long id, @PathVariable Long contractId) {
        employeeContractService.delete(id, contractId);
        return Result.success();
    }
}
