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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 业务 AI 场景管理接口（会议 AI 整理纪要 + 持續績效 AI 整理）。
 *
 * <p>路径按 sceneKey 参数化：sceneKey 不在服务端注册表（REGISTRY）内一律拒绝，
 * 未登记场景无法被探测。会议场景保留旧路径语义（同一路径形态），cpm 场景共用本控制器。
 *
 * <p>权限分三档，刻意不合并：{@code ai-operation-auth:view} 只读配置；
 * {@code meeting_ai_manage}/{@code cpm_ai_manage} 改开关——能管会议 AI 的默认管不了绩效 AI
 * （预算与出域内容不同）；{@code meeting_ai_diagnose}/{@code cpm_ai_diagnose} 诊断指定员工。
 * 三者都要求 ai 系统准入——不依赖 {@code PermissionAspect} 的观察模式，服务端显式再校验一次。
 *
 * <p>诊断与员工下拉都是敏感读（暴露「谁能用 AI / 员工姓名工号」），响应统一 no-store 并限频。
 */
@RestController
@RequestMapping("/api/ai/scenes")
@RequiredArgsConstructor
public class AiSceneController {

    private static final int DIAGNOSE_MAX_PER_MINUTE = 20;
    private static final int OPTION_LIMIT = 30;
    /** 场景 → 治理动作对（manage/diagnose）；与 AiSceneConfigSchemaInitializer 追加的动作逐字一致 */
    private static final Map<String, String[]> SCENE_GOVERN_ACTIONS = Map.of(
            MeetingConstants.SCENE_MEETING_MINUTES,
            new String[]{"meeting_ai_manage", "meeting_ai_diagnose"},
            com.mftb.admin.constant.CpmConstants.SCENE_CPM_REPORT,
            new String[]{"cpm_ai_manage", "cpm_ai_diagnose"});

    private final AiSceneService sceneService;
    private final PermissionService permissionService;
    private final OperatorResolver operatorResolver;
    private final ApiRateLimiter rateLimiter;
    private final SysUserMapper userMapper;

    @GetMapping("/{sceneKey}")
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "读业务 AI 场景配置")
    public Result<AiSceneDto.ConfigVO> read(@PathVariable String sceneKey, HttpServletResponse response) {
        assertAiSystemAccess();
        noStore(response);
        return Result.success(sceneService.read(sceneKey));
    }

    @PutMapping("/{sceneKey}")
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "保存业务 AI 场景开关（乐观锁 + 严格审计）")
    public Result<AiSceneDto.ConfigVO> save(@PathVariable String sceneKey,
                                            @RequestBody @Valid AiSceneDto.ConfigForm form,
                                            HttpServletResponse response) {
        assertAiSystemAccess();
        assertGovernAction(sceneKey, 0);
        noStore(response);
        return Result.success("場景配置已保存", sceneService.save(sceneKey, form, operatorResolver.currentUser()));
    }

    @PostMapping("/{sceneKey}/diagnose")
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "诊断指定员工的场景 AI 可用性（只读，不调模型）")
    public Result<AiSceneDto.DiagnosisVO> diagnose(@PathVariable String sceneKey,
                                                   @RequestBody @Valid AiSceneDto.DiagnoseForm form,
                                                   HttpServletResponse response) {
        assertAiSystemAccess();
        assertGovernAction(sceneKey, 1);
        if (!rateLimiter.tryAcquire("ai:scene:diagnose:" + sceneKey, DIAGNOSE_MAX_PER_MINUTE, 60_000L)) {
            throw new BusinessException(429, "診斷過於頻繁，請稍後再試");
        }
        noStore(response);
        SysUser target = userMapper.selectById(form.getUserId());
        if (target == null || BuiltinAccounts.isSystemAccount(target.getUsername())) {
            // 不区分「不存在」与「系统账号」，避免被用来枚举用户是否存在
            throw new BusinessException("員工不存在");
        }
        return Result.success(sceneService.evaluate(sceneKey, target));
    }

    @GetMapping("/{sceneKey}/employee-options")
    @RequirePermission(menu = "ai-operation-auth", action = "view")
    @Operation(summary = "诊断员工下拉（最小字段：姓名 + 工号）")
    public Result<AiSceneDto.EmployeePage> employeeOptions(@PathVariable String sceneKey,
                                                           @RequestParam(required = false) String keyword,
                                                           @RequestParam(required = false) String ids,
                                                           HttpServletResponse response) {
        assertAiSystemAccess();
        assertGovernAction(sceneKey, 1);
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

    /**
     * 场景治理动作校验（0=manage，1=diagnose）。注解只挂 view 入口，真实边界在此：
     * 每个场景一套 manage/diagnose 动作，能管会议 AI 的默认管不了绩效 AI。超管直通与纪要 status 同口径。
     */
    private void assertGovernAction(String sceneKey, int index) {
        String[] pair = SCENE_GOVERN_ACTIONS.get(sceneKey);
        if (pair == null) {
            throw new BusinessException("場景未登記");
        }
        SysUser current = operatorResolver.currentUser();
        if (current != null && operatorResolver.isAdmin(current)) {
            return;
        }
        if (!permissionService.hasPermission(current, "ai-operation-auth", pair[index])) {
            throw new BusinessException("無權管理該場景的 AI 開關或診斷");
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
