package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.*;
import com.mftb.admin.service.EamBorrowService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 借用管理接口
 */
@RestController
@RequestMapping("/api/eam/borrows")
@RequiredArgsConstructor
public class EamBorrowController {

    private static final String MENU = "asset-borrow";
    private final EamBorrowService borrowService;

    /** 分页查询 */
    @GetMapping
    @RequirePermission(menu = MENU)
    public Result<PageResult<EamBorrowVO>> page(@ModelAttribute EamBorrowQuery query) {
        return Result.success(borrowService.page(query));
    }

    /** 详情 */
    @GetMapping("/{id}")
    @RequirePermission(menu = MENU)
    public Result<EamBorrowVO> detail(@PathVariable long id) {
        return Result.success(borrowService.detail(id));
    }

    /* ===== 自助视图（登录即可，服务层强制本人口径并校验归属；“我的资产”页数据源） ===== */

    /** 本人借用分页 */
    @GetMapping("/my")
    public Result<PageResult<EamBorrowVO>> myPage(@ModelAttribute EamBorrowQuery query) {
        return Result.success(borrowService.myPage(query));
    }

    /** 本人借用统计 */
    @GetMapping("/my/stats")
    public Result<EamBorrowStatsVO> myStats() {
        return Result.success(borrowService.myStats());
    }

    /** 本人借用详情 */
    @GetMapping("/my/{id}")
    public Result<EamBorrowVO> myDetail(@PathVariable long id) {
        return Result.success(borrowService.myDetail(id));
    }

    /** 登记借用 */
    @PostMapping
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Long> register(@RequestBody EamBorrowSaveDTO dto) {
        return Result.success(borrowService.register(dto));
    }

    /** 续借 */
    @PostMapping("/{id}/renew")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> renew(@PathVariable long id, @RequestBody EamBorrowRenewDTO dto) {
        borrowService.renew(id, dto);
        return Result.success();
    }

    /** 取消借用 */
    @PostMapping("/{id}/cancel")
    @RequirePermission(menu = MENU, action = "edit")
    public Result<Void> cancel(@PathVariable long id, @RequestBody Map<String, String> body) {
        borrowService.cancel(id, body.get("reason"));
        return Result.success();
    }
}
