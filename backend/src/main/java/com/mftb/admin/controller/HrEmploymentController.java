package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.EmployeeConstants;
import com.mftb.admin.constant.HrAuditAction;
import com.mftb.admin.dto.EmploymentPeriodSyncRequest;
import com.mftb.admin.dto.HrAuditEntry;
import com.mftb.admin.dto.ProfileDiffReportVO;
import com.mftb.admin.service.HrAuditService;
import com.mftb.admin.service.HrEmploymentPeriodService;
import com.mftb.admin.service.HrProfileDiffService;
import com.mftb.admin.service.OrgScopeService;
import com.mftb.admin.util.OperatorResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.mftb.admin.common.Result;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 雇佣期间与雇佣数据核对接口（方案 §7.1 双轨第一阶段）。
 * <p>
 * 两个端点的权限不对称是刻意的：
 * <ul>
 *   <li>{@code GET /diff-report} 只要 {@code view} —— 它只读，且已经按操作者的组织数据范围收敛，
 *       「看得见自己那条线的 HR」才有资格核对自己的数据；</li>
 *   <li>{@code POST /periods/sync} 要 {@code edit}，并且逐个员工再校验一次归属，
 *       不信任前端传来的 id 列表（前端能改的就是「点名谁」）。</li>
 * </ul>
 */
@Slf4j
@Tag(name = "雇佣期间与数据核对")
@RestController
@RequestMapping("/api/hr/employment")
@RequiredArgsConstructor
public class HrEmploymentController {

    private final HrProfileDiffService profileDiffService;
    private final HrEmploymentPeriodService employmentPeriodService;
    private final OrgScopeService orgScopeService;
    private final OperatorResolver operatorResolver;
    private final HrAuditService hrAuditService;

    @Operation(summary = "雇佣数据差异报告（账号快照 / 任职事实 / 雇佣期间三方对照）")
    @GetMapping("/diff-report")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_VIEW)
    public Result<ProfileDiffReportVO> diffReport(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return Result.success(profileDiffService.report(asOf == null ? LocalDate.now() : asOf));
    }

    @Operation(summary = "按任职事实登记/修复雇佣期间（HR 核对差异清单后逐个点名执行）")
    @PostMapping("/periods/sync")
    @RequirePermission(menu = EmployeeConstants.MENU_EMPLOYEE, action = EmployeeConstants.ACTION_EDIT)
    public Result<Map<String, Object>> syncPeriods(@Valid @RequestBody EmploymentPeriodSyncRequest request) {
        List<Long> userIds = request.getUserIds().stream().filter(java.util.Objects::nonNull).distinct().toList();
        if (userIds.isEmpty()) {
            throw new BusinessException("請至少選擇一名員工");
        }
        // 逐人校验归属：批量入口最容易漏的就是「拿着 edit 权把别人的历史物化」
        String operator = operatorResolver.currentOperatorName();
        // 先把整批归属验完再写：一边验一边写会做出「前一半已登记、后一半被拒」的中间态，
        // 而雇佣期间是投影，半登记比全失败更难发现（下次 sync 会把它当已存在行继续合并）。
        for (Long userId : userIds) {
            orgScopeService.requireVisibleUser(userId);
        }
        int updatedUsers = 0;
        int periods = 0;
        for (Long userId : userIds) {
            int synced = employmentPeriodService.syncFromRecords(userId, operator);
            if (synced > 0) {
                updatedUsers++;
                periods += synced;
                // 谁把历史物化了一批雇佣期间：这一步会直接变成「本次雇佣起点」，必须可追溯到人名
                hrAuditService.record(HrAuditEntry.of(HrAuditAction.PERIOD_REGISTER, userId)
                        .detail("按任職事實登記 " + synced + " 段僱傭期間")
                        .reason(request.getReason()));
            }
        }
        log.info("雇佣期间登记完成: operator={}, 人数={}, 段数={}", operator, updatedUsers, periods);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("requested", userIds.size());
        result.put("updatedUsers", updatedUsers);
        result.put("periods", periods);
        // 点名了但一段都没物化 = 这些人缺入职锚点，必须让调用方看见「没做成」而不是收到一个成功
        result.put("skippedUsers", userIds.size() - updatedUsers);
        return Result.success("已按任職事實登記 " + periods + " 段僱傭期間", result);
    }
}
