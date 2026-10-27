package com.mftb.admin.controller;

import com.mftb.admin.common.Result;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.dto.SystemAccessGrantOptionVO;
import com.mftb.admin.dto.SystemAccessRequestCreateDTO;
import com.mftb.admin.dto.SystemAccessRequestVO;
import com.mftb.admin.dto.SystemAccessRoleOptionVO;
import com.mftb.admin.service.SystemAccessRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 系統權限申請接口（企業門戶「我要申請」）。
 * <p>
 * <b>刻意不加 {@code @RequirePermission}（例外已登记）</b>：本接口的使用者正是「对所申请系统没有任何权限」
 * 的员工，任何菜单级权限注解都会把他们挡在门外，让门户的「我要申請」变成死链——这恰恰是本次要修的缺陷。
 * 与 {@code /api/notifications}（个人通知）、{@code /api/portal/context}（个人可进系统）同属
 * 「仅需登录态的自助接口」口径。
 * <p>
 * 补偿控制（全部在服务层，不依赖前端）：
 * <ul>
 *   <li>申请人身份只取登录态，请求体里没有身份字段可传，无法替他人申请；</li>
 *   <li>提交只影响申请人自己：写入的是一张待审批单据，不产生任何权限变更（申请人可选的
 *       {@code preferredRoleId} 只是建议，不进授权写入路径）；</li>
 *   <li>详情与授权候选按「本人 / 当前节点审批人 / 超管 / 持 oa-requests 查看权」收敛，其余 403；</li>
 *   <li>授权动作本身不在这里：它由 OA 审批接口（{@code oa-requests:edit} + 节点审批人校验）触发。</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/oa/system-access-requests")
@RequiredArgsConstructor
public class SystemAccessRequestController {

    private final SystemAccessRequestService systemAccessRequestService;

    /** 提交系统权限申请（发起 OA 流程，返回 XTSQ 流程编号） */
    @PostMapping
    public Result<String> submit(@Valid @RequestBody SystemAccessRequestCreateDTO request) {
        String flowNo = systemAccessRequestService.submit(request);
        return Result.success("申請已提交，流程編號：" + flowNo, flowNo);
    }

    /** 可申请系统目录（当前登录人尚未获得准入的启用业务系统），供申请页下拉选择 */
    @GetMapping("/systems")
    public Result<List<PortalSystemVO>> requestableSystems() {
        return Result.success(systemAccessRequestService.requestableSystems());
    }

    /**
     * 参考角色目录（管理员在「角色管理」开放自助申请的角色）。
     * <p>返回体只有 roleId/roleName/description，刻意不含角色编码、菜单数与任何权限明细：
     * 本接口的读者是对目标系统零权限的员工，不能把自助入口做成系统结构地图。
     */
    @GetMapping("/roles")
    public Result<List<SystemAccessRoleOptionVO>> selfServiceRoles(@RequestParam String systemCode) {
        return Result.success(systemAccessRequestService.selfServiceRoles(systemCode));
    }

    /** 我的申请（当前登录人），供门户展示「审批中/已开通」与申请页防重复提交 */
    @GetMapping("/my")
    public Result<List<SystemAccessRequestVO>> my(@RequestParam(required = false) String systemCode) {
        return Result.success(systemAccessRequestService.myRequests(systemCode, false));
    }

    /** 申请详情（含凭证与 OA 当前节点/审批人），供审批详情页渲染申请内容 */
    @GetMapping("/by-flow/{flowNo}")
    public Result<SystemAccessRequestVO> detail(@PathVariable String flowNo) {
        return Result.success(systemAccessRequestService.detailByFlowNo(flowNo));
    }

    /** 授权角色候选（仅当前节点审批人/超管可读），标记申请人建议项与已授权功能数 */
    @GetMapping("/{flowNo}/grant-options")
    public Result<List<SystemAccessGrantOptionVO>> grantOptions(@PathVariable String flowNo) {
        return Result.success(systemAccessRequestService.grantOptions(flowNo));
    }
}
