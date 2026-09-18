package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.BasicInfoRequest;
import com.mftb.admin.dto.EmergencyContactRequest;
import com.mftb.admin.dto.EmergencyContactVO;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.PositionRecordRequest;
import com.mftb.admin.dto.PositionRecordVO;
import com.mftb.admin.dto.ResetPasswordRequest;
import com.mftb.admin.dto.SalaryConfigRequest;
import com.mftb.admin.dto.SalaryConfigVO;
import com.mftb.admin.dto.SalaryDeductionRequest;
import com.mftb.admin.dto.SalaryDeductionVO;
import com.mftb.admin.dto.SalaryIncomeRequest;
import com.mftb.admin.dto.SalaryIncomeVO;
import com.mftb.admin.service.EmergencyContactService;
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
 * 集团员工接口
 */
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;
    private final EmergencyContactService emergencyContactService;
    private final PositionRecordService positionRecordService;
    private final EmployeeSalaryService employeeSalaryService;

    /** 分页查询员工 */
    @GetMapping
    @RequirePermission(menu = "employee-management")
    public Result<PageResult<EmployeeVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String employmentStatus) {
        return Result.success(employeeService.list(page, size, keyword, employmentStatus));
    }

    /** 新增员工 */
    @PostMapping
    @RequirePermission(menu = "employee-management", action = "create")
    public Result<EmployeeVO> create(@Valid @RequestBody EmployeeRequest request) {
        return Result.success("員工創建成功", employeeService.create(request));
    }

    /** 编辑员工 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<EmployeeVO> update(@PathVariable Long id, @Valid @RequestBody EmployeeRequest request) {
        return Result.success("員工信息已更新", employeeService.update(id, request));
    }

    /** 重置密码 */
    @PutMapping("/{id}/password")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> resetPassword(@PathVariable Long id, @Valid @RequestBody ResetPasswordRequest request) {
        employeeService.resetPassword(id, request.getPassword());
        return Result.success();
    }

    /** 启用/停用 */
    @PutMapping("/{id}/status")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        employeeService.updateStatus(id, status);
        return Result.success();
    }

    /** 删除员工 */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = "employee-management", action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        employeeService.delete(id);
        return Result.success();
    }

    // ── 基础信息 ──

    /** 获取基础信息（个人信息 + 证件信息 + 通讯信息 + 账号信息） */
    @GetMapping("/{id}/basic-info")
    @RequirePermission(menu = "employee-management")
    public Result<Map<String, Object>> getBasicInfo(@PathVariable Long id) {
        return Result.success(employeeService.getBasicInfo(id));
    }

    /** 保存个人信息 */
    @PutMapping("/{id}/basic-info/personal")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> savePersonalInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    /** 保存证件信息 */
    @PutMapping("/{id}/basic-info/id-info")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> saveIdInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    /** 保存通讯信息 */
    @PutMapping("/{id}/basic-info/contact")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> saveContactInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    /** 保存账号信息（钉钉用户ID等三方通讯/邮箱账号绑定） */
    @PutMapping("/{id}/basic-info/account")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> saveAccountInfo(@PathVariable Long id, @RequestBody BasicInfoRequest request) {
        employeeService.saveBasicInfo(id, request);
        return Result.success();
    }

    // ── 紧急联系人 ──

    /** 紧急联系人列表 */
    @GetMapping("/{id}/emergency-contacts")
    @RequirePermission(menu = "employee-management")
    public Result<List<EmergencyContactVO>> listEmergencyContacts(@PathVariable Long id) {
        return Result.success(emergencyContactService.listByUserId(id));
    }

    /** 新增紧急联系人 */
    @PostMapping("/{id}/emergency-contacts")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<EmergencyContactVO> createEmergencyContact(@PathVariable Long id,
                                                             @Valid @RequestBody EmergencyContactRequest request) {
        return Result.success("緊急聯繫人已添加", emergencyContactService.create(id, request));
    }

    /** 编辑紧急联系人 */
    @PutMapping("/{id}/emergency-contacts/{contactId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<EmergencyContactVO> updateEmergencyContact(@PathVariable Long id,
                                                              @PathVariable Long contactId,
                                                              @Valid @RequestBody EmergencyContactRequest request) {
        return Result.success("緊急聯繫人已更新", emergencyContactService.update(id, contactId, request));
    }

    /** 删除紧急联系人 */
    @DeleteMapping("/{id}/emergency-contacts/{contactId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> deleteEmergencyContact(@PathVariable Long id, @PathVariable Long contactId) {
        emergencyContactService.delete(id, contactId);
        return Result.success();
    }

    // ── 职务记录 ──

    /** 职务记录列表（按 effectiveSeq DESC） */
    @GetMapping("/{id}/position-records")
    @RequirePermission(menu = "employee-management")
    public Result<List<PositionRecordVO>> listPositionRecords(@PathVariable Long id) {
        return Result.success(positionRecordService.listByUserId(id));
    }

    /** 新增职务记录（自动生成 effectiveSeq） */
    @PostMapping("/{id}/position-records")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<PositionRecordVO> createPositionRecord(@PathVariable Long id,
                                                          @Valid @RequestBody PositionRecordRequest request) {
        return Result.success("職務記錄已添加", positionRecordService.create(id, request));
    }

    /** 编辑职务记录（effectiveSeq +1） */
    @PutMapping("/{id}/position-records/{recordId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<PositionRecordVO> updatePositionRecord(@PathVariable Long id,
                                                          @PathVariable Long recordId,
                                                          @Valid @RequestBody PositionRecordRequest request) {
        return Result.success("職務記錄已更新", positionRecordService.update(id, recordId, request));
    }

    /** 删除职务记录 */
    @DeleteMapping("/{id}/position-records/{recordId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> deletePositionRecord(@PathVariable Long id, @PathVariable Long recordId) {
        positionRecordService.delete(id, recordId);
        return Result.success();
    }

    // ── 费用信息 ──

    /** 收入项列表 */
    @GetMapping("/{id}/salary/incomes")
    @RequirePermission(menu = "employee-management")
    public Result<List<SalaryIncomeVO>> listSalaryIncomes(@PathVariable Long id) {
        return Result.success(employeeSalaryService.listIncomes(id));
    }

    /** 新增收入项 */
    @PostMapping("/{id}/salary/incomes")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<SalaryIncomeVO> createSalaryIncome(@PathVariable Long id,
                                                      @Valid @RequestBody SalaryIncomeRequest request) {
        return Result.success("收入項已添加", employeeSalaryService.createIncome(id, request));
    }

    /** 编辑收入项 */
    @PutMapping("/{id}/salary/incomes/{incomeId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<SalaryIncomeVO> updateSalaryIncome(@PathVariable Long id,
                                                      @PathVariable Long incomeId,
                                                      @Valid @RequestBody SalaryIncomeRequest request) {
        return Result.success("收入項已更新", employeeSalaryService.updateIncome(id, incomeId, request));
    }

    /** 删除收入项 */
    @DeleteMapping("/{id}/salary/incomes/{incomeId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> deleteSalaryIncome(@PathVariable Long id, @PathVariable Long incomeId) {
        employeeSalaryService.deleteIncome(id, incomeId);
        return Result.success();
    }

    /** 扣除项列表 */
    @GetMapping("/{id}/salary/deductions")
    @RequirePermission(menu = "employee-management")
    public Result<List<SalaryDeductionVO>> listSalaryDeductions(@PathVariable Long id) {
        return Result.success(employeeSalaryService.listDeductions(id));
    }

    /** 新增扣除项 */
    @PostMapping("/{id}/salary/deductions")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<SalaryDeductionVO> createSalaryDeduction(@PathVariable Long id,
                                                            @Valid @RequestBody SalaryDeductionRequest request) {
        return Result.success("扣除項已添加", employeeSalaryService.createDeduction(id, request));
    }

    /** 编辑扣除项 */
    @PutMapping("/{id}/salary/deductions/{deductionId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<SalaryDeductionVO> updateSalaryDeduction(@PathVariable Long id,
                                                            @PathVariable Long deductionId,
                                                            @Valid @RequestBody SalaryDeductionRequest request) {
        return Result.success("扣除項已更新", employeeSalaryService.updateDeduction(id, deductionId, request));
    }

    /** 删除扣除项 */
    @DeleteMapping("/{id}/salary/deductions/{deductionId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> deleteSalaryDeduction(@PathVariable Long id, @PathVariable Long deductionId) {
        employeeSalaryService.deleteDeduction(id, deductionId);
        return Result.success();
    }

    /** 获取薪资配置 */
    @GetMapping("/{id}/salary/config")
    @RequirePermission(menu = "employee-management")
    public Result<SalaryConfigVO> getSalaryConfig(@PathVariable Long id) {
        return Result.success(employeeSalaryService.getConfig(id));
    }

    /** 保存薪资配置（存在则更新，不存在则新建） */
    @PutMapping("/{id}/salary/config")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<SalaryConfigVO> saveSalaryConfig(@PathVariable Long id,
                                                    @Valid @RequestBody SalaryConfigRequest request) {
        return Result.success("薪資配置已更新", employeeSalaryService.saveConfig(id, request));
    }
}
