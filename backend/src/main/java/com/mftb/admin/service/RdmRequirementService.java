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

    /**
     * 各视角 Tab 数量。
     *
     * @param executionOnly 为真时按「执行侧地板」计数（排除准入前 + 需求池），
     *                      与需求跟进清单列表同口径，避免视图栏计数与列表行数分叉。
     */
    Map<String, Long> scopeCounts(boolean executionOnly);

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

    /**
     * 複製需求為新草稿。
     * <p>用於「流程版本確定後不可改」的補捙：需要換交付方式的，複製一條新需求重新走流程，
     * 原需求的交付項/評審/測試/驗收記錄完整保留。不繼承項目/迭代/流程版本與衍生資料。
     */
    RdmRequirementVO copy(Long id);

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

    /**
     * 審慎地聯動推進需求狀態（靜默、失敗不影響調用方事務）。
     * <p>供 PRD / 評審等「交付過程寫入」後聯動需求狀態使用：當前狀態沒有該流轉配置、
     * 角色或必填不滿足、V3 分批交付鏈路禁止該動作時一律返回 false，只記日誌不拋錯。
     * <p>為什麼要獨立一個方法：以前在交付服務裡直接 try/catch 調 {@link #transition}，
     * 內層 {@code @Transactional} 拋錯後會把外層事務標記為 rollback-only，
     * 導致「PRD 已寫入但保存接口整體 500（系统繁忙）」。這裡用獨立保存點（NESTED）隔離，
     * 聯動失敗只損失一次狀態推進，不會回滾主數據。
     */
    boolean tryAdvanceQuietly(Long reqId, String actionCode, RdmTransitionDTO payload);

    /**
     * 依「已存在的 PRD / 評審事實」把需求狀態對齊到事實所在位置（受理 → PRD 設計 → 評審）。
     * <p>只對 V1/V2 整需求鏈路生效，且只向前對齊、不越過「評審通過」；
     * 每步都走配置化流轉並寫入狀態流水，操作人為當前登錄人，便於事後追溯。
     * <p>場景：舊數據在「評估中」就先把 PRD 寫好、評審也出了結論，受理後狀態仍停在
     * 「已受理·待排期」，頁面又讓人再寫一次 PRD——用本方法把狀態補到事實位置。
     */
    void alignPrdPhaseStatus(Long reqId);

    /**
     * 调整迭代（归属体系改造）：属性变更而非状态流转，故不走 rdm_transition 状态机，
     * 与迭代列表直改状态同构（独立端点 + 只回写目标字段）。
     * <p>用于「研发 bug / 需求不足要放另外版本」场景：直接把需求换到其它迭代，
     * 并同步该需求下未完成任务的迭代归属（否则需求迭代与任务迭代会分裂，统计对不上）。
     * <p>状态白名单：分配后到验收前（released 之后需先 reopen）；角色白名单：
     * PM / DEV_LEAD / PMO / DISPATCHER 参与者或全量权限者。
     */
    RdmRequirementVO changeIteration(Long id, RdmTransitionDTO dto);

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

    /**
     * 单张验收证据正文（Base64 Data URL）。
     * <p>验收历史的用例明细只回元信息，正文按 index 单张取回；
     * 必须同时校当前用户对该需求的可见权与用例归属，不得凭 caseId 越权取图。
     */
    RdmAcceptanceVO.EvidenceContent caseEvidence(Long reqId, Long caseId, int index);

    /** 工作台待办聚合 */
    RdmWorkbenchVO workbench();

    /** 产品经理候选（含在途负载） */
    List<RdmOptionVO.ProductManager> productManagers();

    /** 技术负责人候选（具备需求分配权）：提出人选定后需求池的处理人就是具体的人 */
    List<RdmOptionVO.Employee> techLeads();

    /** 系统 → 菜单 级联树 */
    List<RdmOptionVO.MenuNode> menuTree();

    /** 菜单下的功能点候选 */
    List<RdmOptionVO.FunctionPoint> functionPoints(String menuKey);
}
