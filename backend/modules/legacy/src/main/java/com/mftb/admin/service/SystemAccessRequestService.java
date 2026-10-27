package com.mftb.admin.service;

import com.mftb.admin.dto.SystemAccessRequestVO;
import com.mftb.admin.dto.SystemAccessRequestCreateDTO;
import com.mftb.admin.dto.PortalSystemVO;
import com.mftb.admin.dto.SystemAccessGrantOptionVO;
import com.mftb.admin.dto.SystemAccessRoleOptionVO;

import java.util.List;

/**
 * 系統權限申請服务（申请侧）。
 * <p>
 * 与审批兑现侧 {@link SystemAccessGrantService} 刻意拆成两个类：本服务要调用
 * {@code OaRequestService.submit} 发起流程，而 OA 引擎在终审时要回调兑现服务，
 * 合成一个类会形成构造器循环依赖（RDM 的 RequirementService / IntakeCallbackService 同法拆分）。
 * <p>
 * 安全口径：申请人身份一律取登录态；授权角色只能由审批人在审批环节配置（申请人的
 * {@code preferredRoleId} 只是建议值，不进任何写入路径）；场景/期限/角色/系统全部回查数据库，
 * 不信任前端传的名称与 ID 语义。
 * <p>
 * 2026-10 改口径：申请侧<b>不再采集勾选菜单</b>（菜单级申请会把系统功能全貌暴露给零权限用户，
 * 且诱导全选），改为陈述使用场景 + 期限 + 诉求，可选指向一个「开放自助申请」的参考角色。
 */
public interface SystemAccessRequestService {

    /**
     * 提交系统权限申请：校验 → 发起 OA 流程（编号 XTSQ）→ 落申请单，同一事务。
     *
     * @return OA 流程编号
     */
    String submit(SystemAccessRequestCreateDTO dto);

    /**
     * 我的申请（当前登录人），按申请时间倒序。
     *
     * @param systemCode 可选，按系统过滤（门户卡片展示「审批中/已开通」用）
     * @param withAttachments 是否解析凭证（列表场景传 false 省流量）
     */
    List<SystemAccessRequestVO> myRequests(String systemCode, boolean withAttachments);

    /**
     * 按流程编号取申请详情（含凭证与 OA 侧当前节点/审批人）。
     * <p>访问控制：申请人本人 / 该流程当前待审节点审批人 / 超管 / 持 oa-requests 查看权者，其余 403。
     */
    SystemAccessRequestVO detailByFlowNo(String flowNo);

    /**
     * 审批人可选的授权角色候选（仅返回已持该系统准入的启用角色，标记申请人建议项）。
     * <p>访问控制：该流程当前待审节点审批人 / 超管，其余 403。
     */
    List<SystemAccessGrantOptionVO> grantOptions(String flowNo);

    /**
     * 申请人可选的「参考角色」目录（门户申请页用）。
     * <p>目录口径：启用中 + 非内置 admin + 已持该系统准入 + {@code self_service_requestable=1}
     * （管理员在「角色管理」逐个开放）。目录为空是正常态：此时申请页只走「陈述诉求」，
     * 由审批人决定授哪个角色。
     * <p>只需登录态（使用者正是对目标系统零权限的员工）；返回体刻意不含 code、菜单数与
     * 任何权限明细，只有角色名与业务说明——自助入口不得成为系统结构地图。
     */
    List<SystemAccessRoleOptionVO> selfServiceRoles(String systemCode);

    /**
     * 当前登录人「尚未获得准入」的启用业务系统（申请表单的系统下拉用）。
     * <p>只排除已授权系统与 portal 哨兵，不做其它过滤：员工本来就能在门户「未获得权限」
     * 页签看到同一份目录，这里不提供任何额外信息，只是让申请页不依赖前端硬编码目录。
     */
    List<PortalSystemVO> requestableSystems();
}
