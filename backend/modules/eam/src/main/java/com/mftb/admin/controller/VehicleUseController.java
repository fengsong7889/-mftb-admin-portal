package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.VehicleConstants;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.VehicleUseDto;
import com.mftb.admin.service.VehicleUseService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 用车单与台账接口
 *
 * <p>路径按动作划分，不提供"任意改状态"的通用更新接口：状态推进只能经由
 * 安排 / 出车 / 归还 / 确认 / 更正这几个有前置校验与审计的入口，
 * 否则任何拿到 DTO 的人都能把单据改成任意状态绕过冲突与权限检查。
 *
 * <p>申请人、办理人、确认人一律服务端从 JWT 取，请求体里没有这些字段的位置。
 */
@RestController
@RequestMapping("/api/vehicle")
@RequiredArgsConstructor
public class VehicleUseController {

    private static final String DISPATCH = VehicleConstants.MENU_DISPATCH;
    private static final String LEDGER = VehicleConstants.MENU_LEDGER;
    private static final String MY_USE = VehicleConstants.MENU_MY_USE;

    private final VehicleUseService useService;

    /* ==================== 查询 ==================== */

    /** 车管待办列表 */
    @GetMapping("/uses")
    @RequirePermission(menu = DISPATCH)
    public Result<PageResult<VehicleUseDto.VO>> page(@ModelAttribute VehicleUseDto.Query query) {
        return Result.success(useService.page(query));
    }

    /** 待办分组统计（顶部 4 张卡 + Tab 徽标）：接与列表同一组查询条件 */
    @GetMapping("/uses/todo-stats")
    @RequirePermission(menu = DISPATCH)
    public Result<VehicleUseDto.TodoStats> todoStats(@ModelAttribute VehicleUseDto.Query query) {
        return Result.success(useService.todoStats(query));
    }

    /**
     * 用车单详情。
     *
     * <p>三个入口共用，因此放开只读备选菜单；服务层再按「本人相关或该车管理人员」收敛，
     * 持有菜单不等于可读任意单（防 IDOR）。
     */
    @GetMapping("/uses/{id}")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_VIEW,
            anyOf = {LEDGER, MY_USE})
    public Result<VehicleUseDto.VO> detail(@PathVariable long id) {
        return Result.success(useService.detail(id));
    }

    /** 审计轨迹（独立记录页，受 view 约束） */
    @GetMapping("/uses/{id}/events")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_VIEW, anyOf = {LEDGER})
    public Result<List<VehicleUseDto.EventVO>> events(@PathVariable long id) {
        return Result.success(useService.events(id));
    }

    /* ==================== 员工视角 ==================== */

    /** 我的用车单（我发起的 + 我驾驶的） */
    @GetMapping("/my-uses")
    @RequirePermission(menu = MY_USE)
    public Result<PageResult<VehicleUseDto.VO>> myUses(@ModelAttribute VehicleUseDto.Query query) {
        query.setScope("my_applied");
        return Result.success(useService.page(query));
    }

    /** 我驾驶的任務 */
    @GetMapping("/my-driving-tasks")
    @RequirePermission(menu = MY_USE)
    public Result<PageResult<VehicleUseDto.VO>> myDrivingTasks(@ModelAttribute VehicleUseDto.Query query) {
        query.setScope("my_driving");
        return Result.success(useService.page(query));
    }

    /** 发起用车申请：一期只落草稿，OA 提交在 B2 接入 */
    @PostMapping("/uses/draft")
    @RequirePermission(menu = MY_USE, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> createDraft(@RequestBody VehicleUseDto.Draft dto) {
        return Result.success("用車草稿已保存", useService.createDraft(dto));
    }

    /* ==================== 车管办理 ==================== */

    /** 授权直接登记 */
    @PostMapping("/uses/direct-register")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> directRegister(@RequestBody VehicleUseDto.DirectRegister dto) {
        return Result.success("已建立授權直接登記單據", useService.directRegister(dto));
    }

    /** 车辆安排 / 改派 */
    @PostMapping("/uses/assign")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> assign(@RequestBody VehicleUseDto.Assign dto) {
        useService.assign(dto);
        return Result.success("車輛已安排，現已形成有效預約", null);
    }

    /** 出车登记 */
    @PostMapping("/uses/depart")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> depart(@RequestBody VehicleUseDto.Depart dto) {
        useService.depart(dto);
        return Result.success("出車已登記", null);
    }

    /** 归还登记 */
    @PostMapping("/uses/return")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> ret(@RequestBody VehicleUseDto.Return dto) {
        useService.ret(dto);
        return Result.success("歸還已登記，等待車管確認", null);
    }

    /** 归还确认归档：确认后才计入正式台账 */
    @PostMapping("/uses/confirm")
    @RequirePermission(menu = DISPATCH, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> confirm(@RequestBody VehicleUseDto.Confirm dto) {
        useService.confirm(dto);
        return Result.success("行程已歸檔並計入用車台賬", null);
    }

    /** 事后补录：先入待核对，不直接计入正式汇总 */
    @PostMapping("/uses/backfill")
    @RequirePermission(menu = LEDGER, action = VehicleConstants.ACTION_CREATE)
    public Result<Long> backfill(@RequestBody VehicleUseDto.Backfill dto) {
        return Result.success("補錄記錄已建立，待核對", useService.backfill(dto));
    }

    /** 授权更正：已结束单据的唯一修改入口 */
    @PostMapping("/uses/correct")
    @RequirePermission(menu = LEDGER, action = VehicleConstants.ACTION_EDIT)
    public Result<Void> correct(@RequestBody VehicleUseDto.Correct dto) {
        useService.correct(dto);
        return Result.success("更正已提交並保留前後值", null);
    }

    /* ==================== 台账 ==================== */

    /** 台账分页（实际发生过的行程） */
    @GetMapping("/ledger")
    @RequirePermission(menu = LEDGER)
    public Result<PageResult<VehicleUseDto.VO>> ledger(@ModelAttribute VehicleUseDto.Query query) {
        return Result.success(useService.ledgerPage(query));
    }

    /** 台账汇总：与 ledgerPage 共用过滤条件，保证页面数字与导出行数一致 */
    @GetMapping("/ledger/stats")
    @RequirePermission(menu = LEDGER)
    public Result<VehicleUseDto.LedgerStats> ledgerStats(@ModelAttribute VehicleUseDto.Query query) {
        return Result.success(useService.ledgerStats(query));
    }

    /** 按部门汇总 */
    @GetMapping("/ledger/by-department")
    @RequirePermission(menu = LEDGER)
    public Result<List<VehicleUseDto.SummaryRow>> ledgerByDepartment() {
        return Result.success(useService.ledgerByDepartment());
    }

    /** 按车辆汇总 */
    @GetMapping("/ledger/by-vehicle")
    @RequirePermission(menu = LEDGER)
    public Result<List<VehicleUseDto.SummaryRow>> ledgerByVehicle() {
        return Result.success(useService.ledgerByVehicle());
    }
}
