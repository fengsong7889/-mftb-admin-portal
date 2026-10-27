package com.mftb.admin.service;

import com.mftb.admin.dto.RdmResourceMemberDTO;
import com.mftb.admin.dto.RdmResourceDTO;
import com.mftb.admin.dto.RdmResourceVO;
import com.mftb.admin.entity.RdmResourceMember;

import java.util.List;

/**
 * 團隊負載服务（阶段 B-1：跨岗位统一只读负载聚合）。
 *
 * <p>与 {@link RdmScheduleService#workload} 的分工：后者只聚合已排期的执行任务（研发视角），
 * 本服务以「研发协作全员」为口径，聚合产品需求、研发/设计/测试任务、测试批次，
 * 供项目经理/产品/研发/测试负责人分派前查看谁有余量、谁已超载。
 *
 * <p>安全：数据范围在服务端按 {@code RdmAccessGuard.canSeeAll} 收敛，
 * 无全量权者只返回本人，负载不变成互相打探绩效的入口。
 */
public interface RdmResourceService {

    /**
     * 团队负载聚合。
     *
     * <p>B-1 口径：返回全量人员行（受 canSeeAll 收敛），部门/岗位/状态/关键词筛选与统计卡
     * 由前端在已返回的全量数据上做（研发协作人员规模可控，一次返回可接受）；
     * 日期区间决定逐日负载窗口，是服务端参数。B-2/B-3 再按需下沉为服务端筛选分页。
     *
     * @param from 起始日 yyyy-MM-dd（空则默认今天）
     * @param to   结束日 yyyy-MM-dd（空则默认今天起 13 天，含首尾最多 92 天）
     * @return 负载总览（人员行 + 逐日 + 统计）
     */
    RdmResourceVO.Workload workload(String from, String to);

    /* ==================== 资源名册（阶段 B-2） ==================== */

    /**
     * 名册列表（含已移出，status 区分）。
     * <p>名册管理动作，Controller 层以 rdm-resource-load:manage 门控。
     */
    List<RdmResourceMember> listMembers();

    /**
     * 纳入/编辑名册成员（按 userId upsert，一人一条）。
     * <p>empNo/userName/dept 从 sys_user 回填快照，不信任前端传值。
     */
    RdmResourceMember saveMember(RdmResourceMemberDTO dto);

    /** 移出名册（status=0，不物理删，保留历史） */
    void removeMember(Long id);

    /* ==================== 待分配工作（阶段 B-3.1，只读） ==================== */

    /**
     * 待分配工作聚合（真实需求池/未指派任务/待接收批次）。
     * <p>只对可分派者（{@code canDispatch} 或 {@code canSeeAll}）返回；无分派权者返回
     * {@code canDispatch=false} 且各列表为空。B-3.1 仅提供分派来源，真正改负责人的写回在 B-3.2。
     * <p>Controller 层以 rdm-resource-load:dispatch 门控（与服务内收敛双门）。
     */
    RdmResourceVO.Unassigned unassigned();

    /* ==================== 分派写回（阶段 B-3.2） ==================== */

    /**
     * 从负载页把研发/设计任务指派给某人、将需求池需求分配给产品经理、或将选定人追加为待受理批次执行人。
     * <p>编排层：校验来源+幂等（{@code executeOnce}）后委托领域写接口（任务 {@code assignTaskOwner}、
     * 需求 {@code batchAssign}、批次 {@code assignExecutors}，均为各自领域唯一真相）。
     * <p>测试批次指派受 pending-only 与 @Version 乐观锁约束（已冻结轮次禁止临时加人）。
     */
    RdmResourceVO.AssignResult assign(RdmResourceDTO.Assign req);
}
