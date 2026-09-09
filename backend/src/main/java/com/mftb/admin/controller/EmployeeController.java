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
import com.mftb.admin.service.EmergencyContactService;
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
        return Result.success("员工创建成功", employeeService.create(request));
    }

    /** 编辑员工 */
    @PutMapping("/{id}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<EmployeeVO> update(@PathVariable Long id, @Valid @RequestBody EmployeeRequest request) {
        return Result.success("员工信息已更新", employeeService.update(id, request));
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

    /** 获取基础信息（个人信息 + 证件信息 + 通讯信息） */
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
        return Result.success("紧急联系人已添加", emergencyContactService.create(id, request));
    }

    /** 编辑紧急联系人 */
    @PutMapping("/{id}/emergency-contacts/{contactId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<EmergencyContactVO> updateEmergencyContact(@PathVariable Long id,
                                                              @PathVariable Long contactId,
                                                              @Valid @RequestBody EmergencyContactRequest request) {
        return Result.success("紧急联系人已更新", emergencyContactService.update(id, contactId, request));
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
        return Result.success("职务记录已添加", positionRecordService.create(id, request));
    }

    /** 编辑职务记录（effectiveSeq +1） */
    @PutMapping("/{id}/position-records/{recordId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<PositionRecordVO> updatePositionRecord(@PathVariable Long id,
                                                          @PathVariable Long recordId,
                                                          @Valid @RequestBody PositionRecordRequest request) {
        return Result.success("职务记录已更新", positionRecordService.update(id, recordId, request));
    }

    /** 删除职务记录 */
    @DeleteMapping("/{id}/position-records/{recordId}")
    @RequirePermission(menu = "employee-management", action = "edit")
    public Result<Void> deletePositionRecord(@PathVariable Long id, @PathVariable Long recordId) {
        positionRecordService.delete(id, recordId);
        return Result.success();
    }
}
