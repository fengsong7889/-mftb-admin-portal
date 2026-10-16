package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmFlowConfigDTO;
import com.mftb.admin.dto.RdmFlowConfigVO;
import com.mftb.admin.service.RdmFlowConfigService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 產研交付（RDM）V3 灰度管理接口（任务29 D 段，供任务23 前端管理页消费）。
 *
 * <p>写与发布是<b>两个独立开关</b>，项目级以 {@code scope_key=PROJECT:<projectId>}（非空唯一）定位；
 * GLOBAL 行承载总闸与全局熔断，<b>熔断优先于任何项目级开启</b>（与任务27 读侧口径一致）。
 *
 * <p><b>安全口径</b>：
 * <ul>
 *   <li>默认关闭：不自动开启任何项目；开启是显式授权动作，仅管理员可操作（服务层 fail-closed，
 *       身份取认证主体，菜单权限只是第一道闸）；</li>
 *   <li>每次开关变更写审计（谁/何时/项目/从→到/原因，落 {@code sys_permission_audit_log}），
 *       审计失败随事务回滚，杜绝「改开关不留痕」；</li>
 *   <li>写端点接 {@code executeOnce} 原子幂等 + {@code expectedVersion} 乐观锁（@Version 条件更新防并发覆盖）；</li>
 *   <li><b>开启灰度 ≠ 放开发布门禁</b>：发布仍须通过任务27 全部硬门禁（{@code RdmReleaseGateService}），
 *       本控制器不提供任何绕过门禁的入口；任务27 读侧判定逻辑（isV3ReleaseEnabled /
 *       enforceV3ReleaseGrayscale / ensureReleaseDisabledForV3）不因本写侧而改变。</li>
 * </ul>
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/flow-config")
@RequiredArgsConstructor
public class RdmFlowConfigController {

    private final RdmFlowConfigService flowConfigService;

    /** 查询当前灰度状态：GLOBAL 行 +（可选）指定项目行 + 两级合成的有效开关（只读，不补建任何行） */
    @GetMapping("/grayscale")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "view")
    @Operation(summary = "查詢 V3 灰度狀態（GLOBAL + 指定項目）")
    public Result<RdmFlowConfigVO.GrayscaleStatus> getGrayscaleStatus(
            @RequestParam(required = false) Long projectId) {
        return Result.success(flowConfigService.grayscaleStatus(projectId));
    }

    /** 变更项目级 V3 写入/发布开关（两个独立开关，null=不变更；仅管理员，审计留痕） */
    @PostMapping("/project/update")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    @Operation(summary = "變更項目級 V3 灰度開關（僅管理員）")
    public Result<RdmFlowConfigVO.GrayscaleStatus> updateProjectFlags(
            @RequestBody RdmFlowConfigDTO.ProjectFlagsUpdate dto) {
        RdmFlowConfigVO.GrayscaleStatus status = flowConfigService.updateProjectFlags(dto);
        log.info("RDM 項目灰度開關已變更: projectId={}, write={}, release={}",
                dto == null ? null : dto.getProjectId(),
                status.getProject() == null ? null : status.getProject().getV3WriteEnabled(),
                status.getProject() == null ? null : status.getProject().getV3ReleaseEnabled());
        return Result.success("項目灰度開關已更新（審計已留痕）", status);
    }

    /** 变更 GLOBAL 行开关（总闸 + 全局熔断，四个开关独立，null=不变更；仅管理员，审计留痕） */
    @PostMapping("/global/update")
    @RequirePermission(menu = RdmConstants.MENU_DELIVERY_RELEASE, action = "edit")
    @Operation(summary = "變更 GLOBAL 灰度總閘/熔斷（僅管理員）")
    public Result<RdmFlowConfigVO.GrayscaleStatus> updateGlobalFlags(
            @RequestBody RdmFlowConfigDTO.GlobalFlagsUpdate dto) {
        RdmFlowConfigVO.GrayscaleStatus status = flowConfigService.updateGlobalFlags(dto);
        log.info("RDM GLOBAL 灰度開關已變更: write={}, release={}, writePaused={}, releasePaused={}",
                status.getGlobal().getV3WriteEnabled(), status.getGlobal().getV3ReleaseEnabled(),
                status.getGlobal().getGlobalWritePaused(), status.getGlobal().getGlobalReleasePaused());
        return Result.success("GLOBAL 灰度開關已更新（審計已留痕）", status);
    }
}
