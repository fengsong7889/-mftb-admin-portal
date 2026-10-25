package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.HcmPersonLifecycleVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrAssignment;
import com.mftb.admin.entity.HrEmployment;
import com.mftb.admin.entity.HrProfileItem;
import com.mftb.admin.entity.Person;
import com.mftb.admin.service.HcmPersonService;
import com.mftb.admin.service.HrLifecycleService;
import com.mftb.admin.service.HrProfileService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;

/**
 * 人员主数据接口（{@code /api/hcm/v1/hr/**}）——C3 花名册的取数与维护入口。
 * <p>
 * 归属说明：人员、雇佣、任职都属于「人事管理（hr）」域（方案 13.3 把
 * {@code emp_position_record} 划归 hr），因此菜单 system_code 用 hr，
 * 但菜单 key 是全新的 {@code hcm-person}，不复用旧 {@code hr-profile} / {@code employee-management}：
 * 旧花名册仍以 sys_user 为事实源，新主档以 person 为事实源，两者的写权不能混在一起。
 */
@RestController
@RequestMapping("/api/hcm/v1/hr")
@RequiredArgsConstructor
public class HcmPersonController {

    private final HcmPersonService personService;
    private final HrLifecycleService hrLifecycleService;
    private final HrProfileService hrProfileService;

    /* ==================== 人员 ==================== */

    @GetMapping("/persons")
    @RequirePermission(menu = "hcm-person")
    public Result<PageResult<Person>> listPersons(@RequestParam(defaultValue = "1") long page,
                                                  @RequestParam(defaultValue = "20") long size,
                                                  @RequestParam(required = false) String keyword,
                                                  @RequestParam(required = false) Integer status) {
        return Result.success(personService.listPersons(page, size, keyword, status));
    }

    @GetMapping("/persons/{id}")
    @RequirePermission(menu = "hcm-person")
    public Result<Person> personDetail(@PathVariable Long id) {
        return Result.success(personService.getPerson(id));
    }

    /** 建档：允许不填账号（无账号人员），账号映射由服务层校验唯一 */
    @PostMapping("/persons")
    @RequirePermission(menu = "hcm-person", action = "create")
    public Result<Person> createPerson(@RequestBody Person entity) {
        entity.setId(null);
        return Result.success("人員已建檔", personService.savePerson(entity));
    }

    @PutMapping("/persons/{id}")
    @RequirePermission(menu = "hcm-person", action = "edit")
    public Result<Person> updatePerson(@PathVariable Long id, @RequestBody Person entity) {
        entity.setId(id);
        return Result.success("人員已保存", personService.savePerson(entity));
    }

    @DeleteMapping("/persons/{id}")
    @RequirePermission(menu = "hcm-person", action = "delete")
    public Result<Void> deletePerson(@PathVariable Long id) {
        personService.deletePerson(id);
        return Result.success("人員已刪除", null);
    }

    /**
     * 该人员的人事异动摘要（只读聚合）。
     * <p>
     * 无账号人员直接返回空：异动单据以 sys_user 为锚点（旧域），没有账号就没有单据，
     * 这是事实而不是错误。敏感字段（证件/手机/邮箱）不在此返回。
     */
    @GetMapping("/persons/{id}/lifecycle")
    @RequirePermission(menu = "hcm-person")
    public Result<java.util.List<HcmPersonLifecycleVO>> personLifecycle(@PathVariable Long id) {
        Person person = personService.getPerson(id);
        if (person.getSysUserId() == null) {
            return Result.success(java.util.List.of());
        }
        java.util.List<HcmPersonLifecycleVO> summary = hrLifecycleService.listByUser(person.getSysUserId(), 50)
                .stream()
                .map(vo -> {
                    HcmPersonLifecycleVO item = new HcmPersonLifecycleVO();
                    item.setReqNo(vo.getReqNo());
                    item.setType(vo.getType());
                    item.setStatus(vo.getStatus());
                    item.setEffectiveDate(vo.getEffectiveDate());
                    item.setReason(vo.getReason());
                    item.setFlowNo(vo.getFlowNo());
                    return item;
                })
                .toList();
        return Result.success(summary);
    }

    /* ==================== 档案扩展（教育/履历/资质/奖惩） ==================== */

    @GetMapping("/persons/{id}/profile-items")
    @RequirePermission(menu = "hcm-person")
    public Result<java.util.List<HrProfileItem>> listProfileItems(@PathVariable Long id,
                                                                 @RequestParam(required = false) String itemType) {
        return Result.success(hrProfileService.listByPerson(id, itemType));
    }

    @GetMapping("/profile-items/{id}")
    @RequirePermission(menu = "hcm-person")
    public Result<HrProfileItem> profileItemDetail(@PathVariable Long id) {
        return Result.success(hrProfileService.getItem(id));
    }

    @PostMapping("/profile-items")
    @RequirePermission(menu = "hcm-person", action = "create")
    public Result<HrProfileItem> createProfileItem(@RequestBody HrProfileItem item) {
        item.setId(null);
        return Result.success("檔案記錄已新增", hrProfileService.saveItem(item));
    }

    @PutMapping("/profile-items/{id}")
    @RequirePermission(menu = "hcm-person", action = "edit")
    public Result<HrProfileItem> updateProfileItem(@PathVariable Long id, @RequestBody HrProfileItem item) {
        item.setId(id);
        return Result.success("檔案記錄已保存", hrProfileService.saveItem(item));
    }

    @DeleteMapping("/profile-items/{id}")
    @RequirePermission(menu = "hcm-person", action = "delete")
    public Result<Void> deleteProfileItem(@PathVariable Long id) {
        hrProfileService.deleteItem(id);
        return Result.success("檔案記錄已刪除", null);
    }

    /* ==================== 雇佣关系 ==================== */

    @GetMapping("/persons/{personId}/employments")
    @RequirePermission(menu = "hcm-person")
    public Result<PageResult<HrEmployment>> listEmployments(@PathVariable Long personId,
                                                           @RequestParam(defaultValue = "1") long page,
                                                           @RequestParam(defaultValue = "20") long size,
                                                           @RequestParam(required = false) Integer status) {
        return Result.success(personService.listEmployments(personId, page, size, status));
    }

    @GetMapping("/employments/{id}")
    @RequirePermission(menu = "hcm-person")
    public Result<HrEmployment> employmentDetail(@PathVariable Long id) {
        return Result.success(personService.getEmployment(id));
    }

    @PostMapping("/employments")
    @RequirePermission(menu = "hcm-person", action = "create")
    public Result<HrEmployment> createEmployment(@RequestBody HrEmployment entity) {
        entity.setId(null);
        return Result.success("雇佣關係已建立", personService.saveEmployment(entity));
    }

    @PutMapping("/employments/{id}")
    @RequirePermission(menu = "hcm-person", action = "edit")
    public Result<HrEmployment> updateEmployment(@PathVariable Long id, @RequestBody HrEmployment entity) {
        entity.setId(id);
        return Result.success("雇佣關係已保存", personService.saveEmployment(entity));
    }

    /** 终止雇佣：只写结束日期，不删除记录 */
    @PostMapping("/employments/{id}/terminate")
    @RequirePermission(menu = "hcm-person", action = "edit")
    public Result<HrEmployment> terminateEmployment(
            @PathVariable Long id,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        return Result.success("雇佣關係已終止", personService.terminateEmployment(id, endDate));
    }

    /* ==================== 任职 ==================== */

    @GetMapping("/employments/{employmentId}/assignments")
    @RequirePermission(menu = "hcm-person")
    public Result<PageResult<HrAssignment>> listAssignments(
            @PathVariable Long employmentId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size) {
        return Result.success(personService.listAssignments(employmentId, asOf, page, size));
    }

    @GetMapping("/assignments/{id}")
    @RequirePermission(menu = "hcm-person")
    public Result<HrAssignment> assignmentDetail(@PathVariable Long id) {
        return Result.success(personService.getAssignment(id));
    }

    @PostMapping("/assignments")
    @RequirePermission(menu = "hcm-person", action = "create")
    public Result<HrAssignment> createAssignment(@RequestBody HrAssignment entity) {
        entity.setId(null);
        return Result.success("任職已建立", personService.saveAssignment(entity));
    }

    @PutMapping("/assignments/{id}")
    @RequirePermission(menu = "hcm-person", action = "edit")
    public Result<HrAssignment> updateAssignment(@PathVariable Long id, @RequestBody HrAssignment entity) {
        entity.setId(id);
        return Result.success("任職已保存", personService.saveAssignment(entity));
    }
}
