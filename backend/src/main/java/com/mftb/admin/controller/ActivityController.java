package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.dto.ActivityVO;
import com.mftb.admin.service.ActivityService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系统活动查询接口
 * <p>
 * 活动会定期启动/停用；自然流量「活动加分」规则通过活动ID获取活动名称与状态。
 */
@RestController
@RequestMapping("/api/activity")
@RequiredArgsConstructor
public class ActivityController {

    private final ActivityService activityService;

    /** 活动列表（关键字/状态过滤，供配置时选择活动） */
    @GetMapping("/list")
    @RequirePermission(menu = "promotion-algorithm")
    public Result<List<ActivityVO>> list(@RequestParam(required = false) String keyword,
                                         @RequestParam(required = false) Integer status) {
        return Result.success(activityService.list(keyword, status));
    }

    /** 按活动ID获取活动名称与状态 */
    @GetMapping("/{activityNo}")
    @RequirePermission(menu = "promotion-algorithm")
    public Result<ActivityVO> getByNo(@PathVariable String activityNo) {
        ActivityVO vo = activityService.getByNo(activityNo);
        if (vo == null) {
            throw new BusinessException("活動不存在: " + activityNo);
        }
        return Result.success(vo);
    }
}
