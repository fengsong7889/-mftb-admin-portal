package com.mftb.admin.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.BuiltinAccounts;
import com.mftb.admin.constant.MeetingConstants;
import com.mftb.admin.constant.SystemCode;
import com.mftb.admin.dto.AiSceneDto;
import com.mftb.admin.entity.SysUser;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.service.agent.AiSceneService;
import com.mftb.admin.util.ApiRateLimiter;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 业务 AI 场景管理接口（试点：会议 AI 整理纪要）。
 *
 * <p>权限分三档，刻意不合并：{@code ai-operation-auth:view} 只读配置；
 * {@code meeting_ai_manage} 改开关；{@code meeting_ai_diagnose} 诊断指定员工。
 * 三者都要求 ai 系统准入——不依赖 {@code PermissionAspect} 的观察模式，服务端显式再校验一次。
 *
 * <p>诊断与员工下拉都是敏感读（暴露「谁能用 AI / 员工姓名工号」），响应统一 no-store 并限频。
 */
@RestController
@RequestMapping("/api/ai/scenes/meeting_minutes")
@RequiredArgsConstructor
public class AiSceneController {

    private static final String SCENE = MeetingConstants.SCENE_MEETING_MINUTES;
    private static final int DIAGNOSE_MAX_PER_MINUTE = 20;
    private static final int OPTION_LIMIT = 30;

    private final AiSceneService sceneService;
    private final PermissionService permissionService;
    private final OperatorResolver operatorResolver;
    private final ApiRateLimiter rateLimiter;
    private final SysUserMapper userMapper;

    @GetMapping
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "读会议 AI 场景配置")
    public Result<AiSceneDto.ConfigVO> read(HttpServletResponse response) {
        assertAiSystemAccess();
        noStore(response);
        return Result.success(sceneService.read(SCENE));
    }

    @PutMapping
    @RequirePermission(menu = "ai-operation-auth", action = "meeting_ai_manage")
    @Operation(summary = "保存会议 AI 场景开关（乐观锁 + 严格审计）")
    public Result<AiSceneDto.ConfigVO> save(@RequestBody @Valid AiSceneDto.ConfigForm form, HttpServletResponse response) {
        assertAiSystemAccess();
        noStore(response);
        return Result.success("場景配置已保存", sceneService.save(SCENE, form, operatorResolver.currentUser()));
    }

    @PostMapping("/diagnose")
    @RequirePermission(menu = "ai-operation-auth", action = "meeting_ai_diagnose")
    @Operation(summary = "诊断指定员工的会议 AI 可用性（只读，不调模型）")
    public Result<AiSceneDto.DiagnosisVO> diagnose(@RequestBody @Valid AiSceneDto.DiagnoseForm form, HttpServletResponse response) {
        assertAiSystemAccess();
        if (!rateLimiter.tryAcquire("ai:scene:diagnose", DIAGNOSE_MAX_PER_MINUTE, 60_000L)) {
            throw new BusinessException(429, "診斷過於頻繁，請稍後再試");
        }
        noStore(response);
        SysUser target = userMapper.selectById(form.getUserId());
        if (target == null || BuiltinAccounts.isSystemAccount(target.getUsername())) {
            // 不区分「不存在」与「系统账号」，避免被用来枚举用户是否存在
            throw new BusinessException("員工不存在");
        }
        return Result.success(sceneService.evaluate(SCENE, target));
    }

    @GetMapping("/employee-options")
    @RequirePermission(menu = "ai-operation-auth", action = "meeting_ai_diagnose")
    @Operation(summary = "诊断员工下拉（最小字段：姓名 + 工号）")
    public Result<AiSceneDto.EmployeePage> employeeOptions(@RequestParam(required = false) String keyword,
                                                           @RequestParam(required = false) String ids,
                                                           HttpServletResponse response) {
        assertAiSystemAccess();
        noStore(response);
        LambdaQueryWrapper<SysUser> wrapper = new LambdaQueryWrapper<SysUser>()
                .select(SysUser::getId, SysUser::getName, SysUser::getUsername, SysUser::getEmpId)
                .eq(SysUser::getStatus, 1)
                .ne(SysUser::getUsername, BuiltinAccounts.ADMIN_USERNAME);
        List<Long> idList = parseIds(ids);
        if (!idList.isEmpty()) {
            wrapper.in(SysUser::getId, idList);
        } else if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(SysUser::getName, kw).or().like(SysUser::getEmpId, kw)
                    .or().like(SysUser::getUsername, kw));
        }
        wrapper.last("LIMIT " + OPTION_LIMIT);
        List<AiSceneDto.EmployeeOption> records = userMapper.selectList(wrapper).stream()
                // 只回姓名 + 工号，不回部门/职位：诊断选人不需要组织归属
                .map(u -> new AiSceneDto.EmployeeOption(u.getId(),
                        StringUtils.hasText(u.getName()) ? u.getName() : u.getUsername(), u.getEmpId()))
                .toList();
        return Result.success(new AiSceneDto.EmployeePage(records, records.size()));
    }

    /** 显式 ai 系统准入：不依赖切面观察模式，普通业务角色即便被误配动作也进不来。 */
    private void assertAiSystemAccess() {
        SysUser current = operatorResolver.currentUser();
        if (current == null || !permissionService.hasSystemAccess(current, SystemCode.AI.code())) {
            throw new BusinessException("無權使用該業務系統的 AI 能力");
        }
    }

    private static List<Long> parseIds(String ids) {
        if (!StringUtils.hasText(ids)) {
            return List.of();
        }
        return java.util.Arrays.stream(ids.split(",")).map(String::trim).filter(StringUtils::hasText)
                .map(s -> {
                    try {
                        return Long.parseLong(s);
                    } catch (NumberFormatException e) {
                        throw new BusinessException("人員ID格式不正確");
                    }
                }).distinct().limit(OPTION_LIMIT).toList();
    }

    private static void noStore(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("Pragma", "no-cache");
    }
}
