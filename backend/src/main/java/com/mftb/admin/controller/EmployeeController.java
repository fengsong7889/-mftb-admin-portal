package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.EmployeeRequest;
import com.mftb.admin.dto.EmployeeVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.ResetPasswordRequest;
import com.mftb.admin.service.EmployeeService;
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

/**
 * 集团员工接口
 */
@RestController
@RequestMapping("/api/employees")
@RequiredArgsConstructor
public class EmployeeController {

    private final EmployeeService employeeService;

    /** 分页查询员工 */
    @GetMapping
    @RequirePermission(menu = "employee-management")
    public Result<PageResult<EmployeeVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Integer status) {
        return Result.success(employeeService.list(page, size, keyword, status));
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
}
