package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.dto.MeetingConfigDto;
import com.mftb.admin.service.MeetingBlacklistService;
import com.mftb.admin.service.MeetingConfigService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 预约规则与黑名单接口（会议管理「預約規則」）。
 *
 * <p>两道控制各自独立：注解管"能不能进这个页面"（{@code meeting-config}），
 * 服务层的 {@code requireRecordManager} 管"这一笔能不能改"（锚在 {@code meeting-record:edit}）。
 * 只留注解是不够的——持有 {@code meeting-config:edit} 的人不该因此获得修改全站规则的权利。
 */
@RestController
@RequestMapping("/api/meeting")
@RequiredArgsConstructor
public class MeetingConfigController {

    private static final String CONFIG = MeetingConstants.MENU_CONFIG;

    private final MeetingConfigService configService;
    private final MeetingBlacklistService blacklistService;

    /* ==================== 全局规则 ==================== */

    /** 读取当前生效规则（含"哪些键还没落库、正用代码兜底值"） */
    @GetMapping("/config")
    @RequirePermission(menu = CONFIG)
    public Result<MeetingConfigDto.RuleView> view() {
        return Result.success(configService.view());
    }

    /** 保存全局规则：键白名单内逐键写入，并把前后差异落审计 */
    @PutMapping("/config")
    @RequirePermission(menu = CONFIG, action = MeetingConstants.ACTION_EDIT)
    public Result<Void> save(@RequestBody @Valid MeetingConfigDto.RuleForm form) {
        configService.save(form);
        return Result.success("預約規則已保存", null);
    }

    /* ==================== 黑名单 ==================== */

    /** 黑名单清单 + 同口径统计卡 */
    @GetMapping("/blacklist")
    @RequirePermission(menu = CONFIG)
    public Result<MeetingConfigDto.BlacklistPage> blacklist(@ModelAttribute MeetingConfigDto.BlacklistQuery query) {
        return Result.success(blacklistService.list(query));
    }

    /** 手动加入限制 */
    @PostMapping("/blacklist")
    @RequirePermission(menu = CONFIG, action = MeetingConstants.ACTION_EDIT)
    public Result<Long> addBlacklist(@RequestBody @Valid MeetingConfigDto.BlacklistForm form) {
        return Result.success("已新增限制記錄", blacklistService.add(form));
    }

    /** 撤销限制：留行不留状态，删行等于毁掉处置记录 */
    @PostMapping("/blacklist/{id}/revoke")
    @RequirePermission(menu = CONFIG, action = MeetingConstants.ACTION_EDIT)
    public Result<Void> revokeBlacklist(@PathVariable long id,
                                        @RequestBody @Valid MeetingConfigDto.RevokeForm form) {
        blacklistService.revoke(id, form);
        return Result.success("限制已撤銷", null);
    }
}
