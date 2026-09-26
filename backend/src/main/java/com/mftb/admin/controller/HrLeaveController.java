package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrLeaveConstants;
import com.mftb.admin.dto.HrLeaveBalanceVO;
import com.mftb.admin.dto.HrLeaveRequestSaveDTO;
import com.mftb.admin.dto.HrLeaveRequestVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.entity.HrLeaveBalance;
import com.mftb.admin.service.HrLeaveService;
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

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * HR 假期接口（额度台账 + 请假申请）。
 * <p>
 * 两个菜单共享本组端点：注解层粗粒度拦截（持有任一假期菜单即可进入），
 * 接口级按额度/请假分别校验 hr-leave-quota 与 hr-leave 的类型级权限（服务层兜底）。
 */
@RestController
@RequestMapping("/api/hr/leave")
@RequiredArgsConstructor
public class HrLeaveController {

    private final HrLeaveService hrLeaveService;

    /** 额度台账分页 */
    @GetMapping("/balances")
    @RequirePermission(menu = "hr-leave-quota", anyOf = {HrLeaveConstants.MENU_LEAVE})
    public Result<PageResult<HrLeaveBalanceVO>> balances(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "20") long size,
            @RequestParam(required = false) Integer year,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrLeaveService.balances(page, size, year, keyword));
    }

    /** 单员工单假别剩余额度（请假表单实时提示，避免前端翻页匹配） */
    @GetMapping("/balances/quota")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, anyOf = {HrLeaveConstants.MENU_QUOTA})
    public Result<Map<String, Object>> quota(@RequestParam Long userId,
                                             @RequestParam String leaveType,
                                             @RequestParam(required = false) Integer year) {
        return Result.success(hrLeaveService.quota(userId, leaveType, year));
    }

    /** 超额（剩余为负）额度行数：跨分页口径，供台账预警 */
    @GetMapping("/balances/overdue-count")
    @RequirePermission(menu = HrLeaveConstants.MENU_QUOTA, anyOf = {HrLeaveConstants.MENU_LEAVE})
    public Result<Long> overdueCount(@RequestParam(required = false) Integer year) {
        return Result.success(hrLeaveService.overdueCount(year));
    }

    /** 新建/编辑额度（used_days 由审批回调维护，请求值忽略；带 id 即更新） */
    @PostMapping("/balances")
    @RequirePermission(menu = "hr-leave-quota", action = "edit")
    public Result<HrLeaveBalance> saveBalance(@RequestBody HrLeaveBalance body) {
        return Result.success("額度已保存", hrLeaveService.saveBalance(body));
    }

    /** 删除额度 */
    @DeleteMapping("/balances/{id}")
    @RequirePermission(menu = "hr-leave-quota", action = "delete")
    public Result<Void> deleteBalance(@PathVariable Long id) {
        hrLeaveService.deleteBalance(id);
        return Result.success("額度記錄已刪除", null);
    }

    /** 批量初始化年度额度（userIds 为空表示全部在职员工） */
    @PostMapping("/balances/batch-init")
    @RequirePermission(menu = "hr-leave-quota", action = "create")
    public Result<Integer> batchInit(@RequestParam Integer year,
                                     @RequestParam String leaveType,
                                     @RequestParam BigDecimal totalDays,
                                     @RequestParam(required = false) List<Long> userIds) {
        int created = hrLeaveService.batchInit(year, leaveType, totalDays, userIds);
        return Result.success("已初始化 " + created + " 條額度記錄", created);
    }

    /** 请假人选下拉（在职员工，按姓名/工号搜索） */
    @GetMapping("/employee-options")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE)
    public Result<List<Map<String, Object>>> employeeOptions(@RequestParam(required = false) String keyword) {
        return Result.success(hrLeaveService.employeeOptions(keyword));
    }

    /** 请假单分页 */
    @GetMapping
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, anyOf = {"hr-leave-quota"})
    public Result<PageResult<HrLeaveRequestVO>> list(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String keyword) {
        return Result.success(hrLeaveService.page(page, size, status, keyword));
    }

    /** 请假单状态数量（Tab 徽标） */
    @GetMapping("/stats")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, anyOf = {"hr-leave-quota"})
    public Result<Map<String, Long>> stats() {
        return Result.success(hrLeaveService.stats());
    }

    /** 请假单详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, anyOf = {"hr-leave-quota"})
    public Result<HrLeaveRequestVO> detail(@PathVariable Long id) {
        return Result.success(hrLeaveService.detail(id));
    }

    /** 保存草稿 */
    @PostMapping
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, action = "create")
    public Result<HrLeaveRequestVO> saveDraft(@Valid @RequestBody HrLeaveRequestSaveDTO dto) {
        return Result.success("草稿已保存", hrLeaveService.saveDraft(dto));
    }

    /** 编辑草稿 */
    @PutMapping("/{id}")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, action = "edit")
    public Result<HrLeaveRequestVO> update(@PathVariable Long id,
                                           @Valid @RequestBody HrLeaveRequestSaveDTO dto) {
        return Result.success("請假單已更新", hrLeaveService.update(id, dto));
    }

    /** 提交审批（创建关联 OA 流程） */
    @PostMapping("/{id}/submit")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, action = "edit")
    public Result<HrLeaveRequestVO> submit(@PathVariable Long id) {
        HrLeaveRequestVO vo = hrLeaveService.submit(id);
        return Result.success("已提交審批，流程編號：" + vo.getFlowNo(), vo);
    }

    /** 撤销审批 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, action = "edit")
    public Result<Void> cancel(@PathVariable Long id) {
        hrLeaveService.cancel(id);
        return Result.success("已撤銷，請假單回到草稿", null);
    }

    /** 删除请假单（仅草稿/驳回/已撤销） */
    @DeleteMapping("/{id}")
    @RequirePermission(menu = HrLeaveConstants.MENU_LEAVE, action = "delete")
    public Result<Void> delete(@PathVariable Long id) {
        hrLeaveService.delete(id);
        return Result.success("請假單已刪除", null);
    }
}
