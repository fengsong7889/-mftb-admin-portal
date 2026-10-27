package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.HrEssConstants;
import com.mftb.admin.dto.HrLifecycleVO;
import com.mftb.admin.dto.PageResult;
import com.mftb.admin.service.HrEssService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 員工自助（ESS）接口：只读「本人」数据。
 * <p>
 * 与 hr-* 人事接口的区别在于：本组端点不接受任何员工标识参数，数据范围固定为登录人，
 * 因此可以给普通员工角色授权而不泄露他人数据；请假相关操作仍走 /api/hr/leave
 * （服务端按数据范围自动收敛到本人）。
 */
@RestController
@RequestMapping("/api/hr/ess")
@RequiredArgsConstructor
public class HrEssController {

    private final HrEssService hrEssService;

    /** 我的人事异动单据（入职/转正/调动/离职/续签） */
    @GetMapping("/my-requests")
    @RequirePermission(menu = HrEssConstants.MENU_REQUESTS)
    public Result<PageResult<HrLifecycleVO>> myRequests(
            @RequestParam(defaultValue = "1") long page,
            @RequestParam(defaultValue = "10") long size,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String status) {
        return Result.success(hrEssService.myRequests(page, size, type, status));
    }

    /** 我的异动单据状态计数（Tab 徽标） */
    @GetMapping("/my-request-stats")
    @RequirePermission(menu = HrEssConstants.MENU_REQUESTS)
    public Result<Map<String, Long>> myRequestStats() {
        return Result.success(hrEssService.myRequestStats());
    }

    /** 我的档案（服务端脱敏视图） */
    @GetMapping("/profile")
    @RequirePermission(menu = HrEssConstants.MENU_PROFILE)
    public Result<Map<String, Object>> profile() {
        return Result.success(hrEssService.myProfile());
    }
}
