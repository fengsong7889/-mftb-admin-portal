package com.mftb.admin.controller;

import com.mftb.admin.annotation.RequirePermission;
import com.mftb.admin.common.Result;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmResourceDTO;
import com.mftb.admin.dto.RdmResourceMemberDTO;
import com.mftb.admin.dto.RdmResourceVO;
import com.mftb.admin.entity.RdmResourceMember;
import com.mftb.admin.service.RdmResourceService;
import io.swagger.v3.oas.annotations.Operation;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 團隊負載接口（阶段 B-1：跨岗位统一只读负载聚合）。
 *
 * <p>从研发工作台的「资源负载」Tab 升级为独立菜单 {@code rdm-resource-load}（项目与计划分组下）。
 * 与 {@code RdmScheduleController#workload} 的区别：后者只聚合已排期执行任务（研发视角），
 * 本接口以研发协作全员为口径，聚合产品需求/研发任务/测试批次，供各负责人分派前查看余量与瓶颈。
 *
 * <p>权限：主锚点为新菜单 {@code rdm-resource-load}；anyOf 保留交付类菜单，使现有研发/需求持权者
 * 在新菜单尚未单独授权时即可访问（菜单种子 v3.18 已建该菜单行，管理员可在授权中心单独收放）。
 * 数据范围在服务端按 {@code RdmAccessGuard.canSeeAll} 收敛——无全量权者只返回本人，
 * 负载页不能变成互相打探绩效的入口。
 */
@Slf4j
@RestController
@RequestMapping("/api/rdm/resource")
@RequiredArgsConstructor
public class RdmResourceController {

    private final RdmResourceService resourceService;

    /** 团队负载（默认今天起 2 周，含首尾最长 92 天） */
    @GetMapping("/workload")
    @Operation(summary = "團隊負載聚合（跨崗位全員口徑）")
    @RequirePermission(menu = RdmConstants.MENU_RESOURCE_LOAD,
            anyOf = {"rdm-delivery-board", "rdm-requirement", "rdm-delivery-iteration", "rdm-intake"},
            anyPermissions = {"rdm-requirement:view_all"})
    public Result<RdmResourceVO.Workload> workload(@RequestParam(required = false) String from,
                                                   @RequestParam(required = false) String to) {
        return Result.success(resourceService.workload(from, to));
    }

    /**
     * 待分配工作聚合（阶段 B-3.1，只读）：需求池/未指派任务/待接收批次。
     * <p>主锚点 dispatch；anyOf 保留交付类菜单使现有持权者无需单独授权即可访问；
     * 服务内再按 {@code canDispatch||canSeeAll} 权威收敛（无权者返回空，注解只是粗门）。
     */
    @GetMapping("/unassigned")
    @Operation(summary = "待分配工作聚合（真实来源）")
    @RequirePermission(menu = RdmConstants.MENU_RESOURCE_LOAD, action = "dispatch",
            anyOf = {"rdm-delivery-board", "rdm-requirement", "rdm-intake"},
            anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmResourceVO.Unassigned> unassigned() {
        return Result.success(resourceService.unassigned());
    }

    /**
     * 分派写回（B-3.2/3.3）：把研发/设计任务指派、将需求分配给产品经理、或将选定人追加为待受理批次执行人。
     * <p>权限锥点与 unassigned 一致（dispatch）；服务内再按来源委托领域写接口
     * （任务 assignTaskOwner、需求 batchAssign、批次 assignExecutors）做同源权威裁决 + 乐观锁/状态 CAS + 幂等。
     */
    @PostMapping("/assign")
    @Operation(summary = "负载页分派写回（任务/需求）")
    @RequirePermission(menu = RdmConstants.MENU_RESOURCE_LOAD, action = "dispatch",
            anyOf = {"rdm-delivery-board", "rdm-requirement", "rdm-intake"},
            anyPermissions = {"rdm-requirement:dispatch"})
    public Result<RdmResourceVO.AssignResult> assign(@RequestBody RdmResourceDTO.Assign req) {
        return Result.success("已分派", resourceService.assign(req));
    }

    /* ==================== 资源名册（阶段 B-2，权限 manage） ==================== */

    /** 名册列表（含已移出，status 区分） */
    @GetMapping("/members")
    @Operation(summary = "資源名冊列表")
    @RequirePermission(menu = RdmConstants.MENU_RESOURCE_LOAD, action = "manage")
    public Result<List<RdmResourceMember>> listMembers() {
        return Result.success(resourceService.listMembers());
    }

    /** 纳入/编辑名册成员（按 userId upsert） */
    @PostMapping("/members")
    @Operation(summary = "納入/編輯資源名冊成員")
    @RequirePermission(menu = RdmConstants.MENU_RESOURCE_LOAD, action = "manage")
    public Result<RdmResourceMember> saveMember(@RequestBody RdmResourceMemberDTO dto) {
        return Result.success("名冊已保存", resourceService.saveMember(dto));
    }

    /** 移出名册（status=0，不物理删） */
    @DeleteMapping("/members/{id}")
    @Operation(summary = "移出資源名冊")
    @RequirePermission(menu = RdmConstants.MENU_RESOURCE_LOAD, action = "manage")
    public Result<Void> removeMember(@PathVariable Long id) {
        resourceService.removeMember(id);
        return Result.success("已移出名冊", null);
    }
}
