package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmConfigVO;
import com.mftb.admin.dto.RdmIntakeVO;
import com.mftb.admin.service.RdmConfigService;
import com.mftb.admin.service.RdmIntakePolicyService;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 產研協同（RDM）配置接口：状态机、流转规则、SLA、分发矩阵、准入策略。
 * <p>读取沿用需求相关菜单共享（看到需求即可理解流转规则），写入需「状态與流轉」编辑权。
 * <p>准入策略的写入额外要求分配侧授权：它能让人免掉公司准入审批，影响面比改一个状态名大得多。
 */
@RestController
@RequestMapping("/api/rdm/config")
@RequiredArgsConstructor
public class RdmConfigController {

    private final RdmConfigService configService;
    private final RdmIntakePolicyService intakePolicyService;
    private final OperatorResolver operatorResolver;

    /** 状态定义 */
    @GetMapping("/status")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {RdmConstants.MENU_INTAKE, RdmConstants.MENU_ACCEPTANCE, RdmConstants.MENU_DASHBOARD, RdmConstants.MENU_WORKBENCH, RdmConstants.MENU_CONFIG})
    public Result<List<RdmConfigVO.StatusDef>> statuses() {
        return Result.success(configService.statusDefs());
    }

    /** 流转规则 */
    @GetMapping("/transition")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {RdmConstants.MENU_INTAKE, RdmConstants.MENU_ACCEPTANCE, RdmConstants.MENU_DASHBOARD, RdmConstants.MENU_WORKBENCH, RdmConstants.MENU_CONFIG})
    public Result<List<RdmConfigVO.Transition>> transitions() {
        return Result.success(configService.transitions());
    }

    /** SLA 与逾期规则 */
    @GetMapping("/sla")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT, anyOf = {RdmConstants.MENU_INTAKE, RdmConstants.MENU_ACCEPTANCE, RdmConstants.MENU_DASHBOARD, RdmConstants.MENU_WORKBENCH, RdmConstants.MENU_CONFIG})
    public Result<List<RdmConfigVO.Sla>> slas() {
        return Result.success(configService.slaConfigs());
    }

    /** 分发矩阵 */
    @GetMapping("/routing")
    @RequirePermission(menu = RdmConstants.MENU_INTAKE, anyOf = {RdmConstants.MENU_CONFIG, RdmConstants.MENU_REQUIREMENT})
    public Result<List<RdmConfigVO.Routing>> routings() {
        return Result.success(configService.routingRules());
    }

    /** 保存分发矩阵，返回最新列表（前端直接刷新表格） */
    @PostMapping("/routing")
    @RequirePermission(menu = RdmConstants.MENU_INTAKE, action = "edit", anyOf = {RdmConstants.MENU_CONFIG})
    public Result<List<RdmConfigVO.Routing>> saveRouting(@RequestBody RdmConfigVO.Routing routing) {
        configService.saveRouting(routing, operatorResolver.currentOperatorName());
        return Result.success("已保存", configService.routingRules());
    }

    /** 保存 SLA 行（新增或改值），返回最新列表 */
    @PutMapping("/sla")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG, action = "edit", anyOf = {RdmConstants.MENU_INTAKE})
    public Result<List<RdmConfigVO.Sla>> saveSla(@RequestBody RdmConfigVO.Sla sla) {
        sla.setOperator(operatorResolver.currentOperatorName());
        configService.saveSla(sla);
        return Result.success("已保存", configService.slaConfigs());
    }

    /** 启停流转规则 */
    @PutMapping("/transition/{id}/enabled")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG, action = "edit")
    public Result<List<RdmConfigVO.Transition>> setTransitionEnabled(
            @PathVariable Long id, @RequestParam boolean enabled) {
        configService.setTransitionEnabled(id, enabled, operatorResolver.currentOperatorName());
        return Result.success("已更新", configService.transitions());
    }

    /** 启停状态定义（停用前服务端会校验是否仍有需求停在該状态） */
    @PutMapping("/status/{code}/enabled")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG, action = "edit")
    public Result<List<RdmConfigVO.StatusDef>> setStatusEnabled(
            @PathVariable String code, @RequestParam boolean enabled) {
        configService.setStatusEnabled(code, enabled, operatorResolver.currentOperatorName());
        return Result.success("已更新", configService.statusDefs());
    }

    /* ==================== 准入策略（阶段 2B） ==================== */

    /** 准入策略列表（含停用项，配置页展示） */
    @GetMapping("/intake-policy")
    @RequirePermission(menu = RdmConstants.MENU_INTAKE, anyOf = {RdmConstants.MENU_CONFIG, RdmConstants.MENU_REQUIREMENT})
    public Result<List<RdmIntakeVO.Policy>> intakePolicies() {
        return Result.success(intakePolicyService.policies());
    }

    /**
     * 保存准入策略（新增/修改）。
     * <p>写入只给「需求配置」编辑权或分配权：能配免审就等于能决谁可以不经公司准入。
     */
    @PostMapping("/intake-policy")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG, action = "edit", anyOf = {RdmConstants.MENU_INTAKE})
    public Result<List<RdmIntakeVO.Policy>> saveIntakePolicy(@RequestBody RdmIntakeVO.Policy policy) {
        intakePolicyService.savePolicy(policy, operatorResolver.currentOperatorName());
        return Result.success("已保存", intakePolicyService.policies());
    }

    /** 删除准入策略（逻辑删；已发生的轮次仍按快照保留命中策略与版本） */
    @DeleteMapping("/intake-policy/{id}")
    @RequirePermission(menu = RdmConstants.MENU_CONFIG, action = "edit", anyOf = {RdmConstants.MENU_INTAKE})
    public Result<List<RdmIntakeVO.Policy>> deleteIntakePolicy(@PathVariable Long id) {
        intakePolicyService.deletePolicy(id);
        return Result.success("已刪除", intakePolicyService.policies());
    }

    /**
     * 准入规则模拟：不写库，只回答「这个人提这条需求会走哪条路」。
     * <p>提交页的「審批要求（由系統判定）」也走本接口，展示与真实裁决同一个口径，
     * 不再由前端自己猜。代别人模拟需分配侧查看权（服务端拦）。
     */
    @PostMapping("/intake-policy/simulate")
    @RequirePermission(menu = RdmConstants.MENU_REQUIREMENT,
            anyOf = {RdmConstants.MENU_INTAKE, RdmConstants.MENU_CONFIG, RdmConstants.MENU_WORKBENCH})
    public Result<RdmIntakeVO.Decision> simulateIntake(@RequestBody(required = false) RdmIntakeVO.SimulateRequest request) {
        return Result.success(intakePolicyService.simulate(request));
    }
}
