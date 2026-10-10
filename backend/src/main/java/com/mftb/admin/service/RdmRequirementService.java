package com.mftb.admin.service;

import com.mftb.admin.dto.PageResult;
import com.mftb.admin.dto.RdmAcceptanceDTO;
import com.mftb.admin.dto.RdmAcceptanceVO;
import com.mftb.admin.dto.RdmOptionVO;
import com.mftb.admin.dto.RdmRequirementCreateDTO;
import com.mftb.admin.dto.RdmRequirementQuery;
import com.mftb.admin.dto.RdmRequirementVO;
import com.mftb.admin.dto.RdmTransitionDTO;
import com.mftb.admin.dto.RdmWorkbenchVO;
import com.mftb.admin.entity.RdmComment;

import java.util.List;
import java.util.Map;

/**
 * RDM 需求服务（提交 / 审批 / 分配 / 受理 / 交付流转 / 验收 / 工作台）
 */
public interface RdmRequirementService {

    /** 需求分页列表（按登录人身份收敛数据范围） */
    PageResult<RdmRequirementVO> page(RdmRequirementQuery query);

    /** 各视角 Tab 数量 */
    Map<String, Long> scopeCounts();

    /**
     * 看板信号卡统计（total/overdue/toAccept/pool）。
     *
     * <p>接与列表同一份查询条件，不能由前端对已加载的行自己数：
     * 看板只拉固定上限条数，数字会永远停在上限值。
     */
    Map<String, Long> stats(RdmRequirementQuery query);

    /** 需求详情（含关联对象、角色、时间轴、评论、附件、审批节点、SLA、可执行动作） */
    RdmRequirementVO detail(Long id);

    /** 提交需求（mode=draft 存草稿），返回需求视图 */
    RdmRequirementVO create(RdmRequirementCreateDTO dto);

    /** 修改需求（仅草稿/准入驳回态） */
    RdmRequirementVO update(Long id, RdmRequirementCreateDTO dto);

    /** 撤回为草稿 */
    RdmRequirementVO withdraw(Long id);

    /**
     * 提出人自助提交 / 修改后重提。
     * <p>为什么要独立命令而不是复用通用流转接口：通用流转要求 {@code rdm-requirement:edit}，
     * 而那个权覆盖受理/PRD/评审等需求侧处理动作；为了「能提交自己的草稿」而开 edit，
     * 等于把产品处理权一并授出去。本方法只要求 create，且仅提出人本人可用。
     * <p>草稿走 submit、准入驳回后重提走 resubmit，按当前状态命中的流转规则选择。
     */
    RdmRequirementVO selfSubmit(Long id, RdmTransitionDTO dto);

    /** 状态流转（按 rdm_transition 校验角色与必填字段） */
    RdmRequirementVO transition(Long id, RdmTransitionDTO dto);

    /** 批量分配产品经理 */
    int batchAssign(List<Long> ids, Long pmUserId);

    /**
     * 产品经理认领需求池里的需求。
     * <p>原子抢单：用条件更新（status=pool 且尚无受理人）保证同一条需求只有一人抢成功，
     * 不靠「先查后改」的读后写（那个在并发下会两人都看到无人认领）。
     */
    RdmRequirementVO claim(Long id);

    /**
     * 改派产品经理（技术负责人/PMO）。
     * <p>旧受理人的参与角色只置为失效、不删除，保留他的历史贡献与可追溯时间轴；
     * 条件更新同样保证两人同时改派时只有一个成功。
     */
    RdmRequirementVO reassignPm(Long id, RdmTransitionDTO dto);

    /** 添加沟通记录 */
    RdmComment addComment(Long id, String content, Boolean internal);

    /** 催办（通知当前处理人） */
    void urge(Long id);

    /** 提交业务验收结论 */
    void submitAcceptance(Long id, RdmAcceptanceDTO dto);

    /**
     * 历次验收记录（含逐条用例）——M3 返工链路展示与一次通过率口径用。
     * <p>按验收时间正序返回，attempt 为当时冻结的第几次验收序号。
     */
    List<RdmAcceptanceVO> acceptanceHistory(Long id);

    /** 工作台待办聚合 */
    RdmWorkbenchVO workbench();

    /** 产品经理候选（含在途负载） */
    List<RdmOptionVO.ProductManager> productManagers();

    /** 系统 → 菜单 级联树 */
    List<RdmOptionVO.MenuNode> menuTree();

    /** 菜单下的功能点候选 */
    List<RdmOptionVO.FunctionPoint> functionPoints(String menuKey);
}
