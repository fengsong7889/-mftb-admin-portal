package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.service.OrgScopeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 当前登录人的组织数据范围接口。
 * <p>
 * 用途：受限范围（仅本人/本部门/…）下列表行数会少于用户预期，不告诉他「现在按什么口径过滤」，
 * 就会被当成「数据丢了」而重复刷新或提工单。见
 * docs/design/员工管理_Core_HR_整改方案_94e06fc1.md §10.9 建议设计第 5 条。
 * <p>
 * 这里刻意不加 {@code @RequirePermission}：返回值只描述调用者<b>自己</b>的范围档位与人数，
 * 不含任何他人数据；边界是「必须登录」（SecurityConfig 的 {@code anyRequest().authenticated()}），
 * 不是「必须持有某个菜单」。任何按范围取数的页面都要能拿到它，把它绑到某个菜单上反而会让
 * 其它系统的页面 403。
 */
@RestController
@RequestMapping("/api/org-scope")
@RequiredArgsConstructor
@Tag(name = "平台能力 - 组织数据范围", description = "当前登录人的人员可见范围")
public class OrgScopeController {

    private final OrgScopeService orgScopeService;

    /** 当前登录人的生效范围（档位、是否不限制、可见部门/人数） */
    @GetMapping("/mine")
    @Operation(summary = "查询当前登录人的数据范围")
    public Result<Map<String, Object>> mine() {
        return Result.success(orgScopeService.describe());
    }
}
