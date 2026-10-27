package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * RDM 需求结构（主子需求）服务（Batch 2 / Phase 1A）。
 * <p>「结构父需求」表达的是聚合关系：一个 {@code aggregate} 需求下挂多个 {@code execution} 子需求，
 * 用于项目级看板按主需求聚合进度。它不同于 {@code parentReqId}（衍生来源，表达「由哪条需求返工/派生而来」），
 * 两者语义正交，不能复用同一列。
 * <p>安全口径：结构关系是需求级写操作，统一走 {@link RdmAccessGuard#requireDeliveryWriter}；
 * 环检测与单父约束在服务端强制，前端隐藏按钮不作为边界。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmRequirementStructureService {

    /** 需求树最大递归深度：防御脏数据成环时无限递归 */
    private static final int MAX_TREE_DEPTH = 5;
    /** 祖先链最大上溯深度：同样是防环护栏 */
    private static final int MAX_ANCESTOR_DEPTH = 20;

    /** executeOnce 业务类型：结构主子绑定（任务19 / 缺口3） */
    private static final String BIZ_STRUCTURE_BIND = "rdm_structure_bind";

    private final RdmRequirementMapper requirementMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmAccessGuard accessGuard;
    /** 原子幂等：结构绑定这类写操作接入 executeOnce，防重试/并发双副作用（任务19 / 缺口3） */
    private final RdmIdempotentService idempotentService;

    /* ==================== 写入 ==================== */

    /**
     * 添加子需求到结构父需求（客户端调用的幂等入口，任务19 / 缺口3 + 决策1/2）。
     * <p><b>幂等边界在本方法</b>：以 executeOnce 包裹，本身即事务边界；实际逻辑落在
     * {@link #doAddChildRequirement}，供事务内的其他顶层入口（如需求 create）直接复用而不重复包裹。
     * <p><b>服务端派生天然幂等键（决策1，不改 DTO/Controller 契约）</b>：结构绑定的 DTO 无 client 幂等令牌，
     * 改由服务端派生：resourceKey={@code structure_child:<childReqId>}（被绑定的资源），
     * clientRequestId={@code bind:<parentReqId>-><childReqId>}（边标识，作为判别子），
     * requestHash=绑定参数的稳定内容哈希。语义：同一逻辑绑定重试→回放；不同边→各自执行；
     * 同边不同内容→CONFLICT，正是乐观并发所要的。
     */
    public void addChildRequirement(Long parentReqId, Long childReqId, Long currentUserId) {
        if (parentReqId == null || childReqId == null) {
            throw new BusinessException("父需求與子需求不能為空");
        }
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_STRUCTURE_BIND)
                .resourceKey("structure_child:" + childReqId)
                .clientRequestId("bind:" + parentReqId + "->" + childReqId)
                .requestHash(idempotentService.stableRequestHash(List.of(
                        String.valueOf(parentReqId), String.valueOf(childReqId), String.valueOf(currentUserId))))
                .build();
        // executeOnce 自身即事务边界，不得再嵌进外层活动事务；doAddChildRequirement 的 @Transactional 以 REQUIRED 加入本事务。
        idempotentService.executeOnce(key, () -> {
            doAddChildRequirement(parentReqId, childReqId, currentUserId);
            return null;
        }, Void.class);
    }

    /**
     * 结构绑定的实际逻辑（事务内纯逻辑，不含 executeOnce）。
     * <p>供两类调用方复用：①{@link #addChildRequirement} 的幂等 supplier；②需求 create 等已处于活动事务的顶层入口
     * （它们直接调本方法以 REQUIRED 加入自身事务，避免把 executeOnce 嵌进活动事务）。
     * <p>校验（任务19 / 缺口3）：
     * <ol>
     *   <li>父<b>与</b>子两侧都要有交付写权限（原来只校父侧）；</li>
     *   <li>父必须是 aggregate 类型；</li>
     *   <li>父<b>与</b>子均必须为 V3 分批交付流程（结构主子是 V3 语义）；</li>
     *   <li>父<b>与</b>子必须同项目（跨项目挂结构会污染项目级聚合口径）；</li>
     *   <li>子不能已有结构父（单父）；不能自引用；无环（向上 DFS）；</li>
     *   <li>写入后做并发成环后置复检（fail-closed 回滚）。</li>
     * </ol>
     */
    @Transactional(rollbackFor = Exception.class)
    public void doAddChildRequirement(Long parentReqId, Long childReqId, Long currentUserId) {
        if (parentReqId == null || childReqId == null) {
            throw new BusinessException("父需求與子需求不能為空");
        }
        if (parentReqId.equals(childReqId)) {
            throw new BusinessException("需求不能作為自己的結構父");
        }
        // 两端鉴权：绑定同时改写父（聚合归属）与子（结构父字段），两侧都必须有交付写权限，
        // 否则只校父侧会让「能改父的人」把别人的执行需求强行挂进来。
        accessGuard.requireDeliveryWriter(parentReqId, "維護需求結構");
        accessGuard.requireDeliveryWriter(childReqId, "維護需求結構");

        RdmRequirement parent = requireReq(parentReqId);
        RdmRequirement child = requireReq(childReqId);

        if (!RdmConstants.KIND_AGGREGATE.equals(parent.getRequirementKind())) {
            throw new BusinessException("只有聚合需求（aggregate）可以掛子需求");
        }
        // 父子均须为 V3：结构主子关系是 V3 分层并行链路的语义，旧流程需求不得混挂。
        if (!isV3(parent.getFlowVersion()) || !isV3(child.getFlowVersion())) {
            throw new BusinessException("結構主子關係僅適用於分批交付，父子需求均須為分批交付");
        }
        // 父子同项目：跨项目挂结构会让项目级聚合进度失真；两者均未关联项目（null）视为同属「未分配」放行。
        if (!java.util.Objects.equals(parent.getProjectId(), child.getProjectId())) {
            throw new BusinessException("父子需求必須屬於同一項目，不可跨項目掛結構");
        }
        if (child.getStructureParentReqId() != null) {
            if (child.getStructureParentReqId().equals(parentReqId)) {
                throw new BusinessException("該子需求已掛在此父需求下");
            }
            throw new BusinessException("該需求已有結構父需求，請先移除後再掛");
        }
        // 环检测（前置）：把 parentReqId 挂到 childReqId 之下会不会成环（child 是 parent 的祖先时成环）
        if (wouldCreateCycle(childReqId, parentReqId)) {
            throw new BusinessException("掛載後會形成循環結構（A→B→…→A），已拒絕");
        }

        child.setStructureParentReqId(parentReqId);
        if (requirementMapper.updateById(child) == 0) {
            throw new BusinessException("子需求已被他人修改，請刷新後重試");
        }
        // 并发成环后置复检（任务19 / 缺口3）：写入后从子需求向上重走祖先链，
        // 若并发中有他人把本链路接成了环（如同时 A→B 与 B→A），此处 fail-closed 抛异常回滚本次绑定。
        // 注意：Mockito 离线单测只能证明「检测到已落库的环即拒绝」，不等价真实数据库并发隔离级别的证明。
        if (hasCycleFrom(childReqId)) {
            throw new BusinessException("掛載後形成循環結構（並發寫入），已回滾拒絕");
        }
        log.info("添加結構子需求: parentReqId={}, childReqId={}, operator={}", parentReqId, childReqId, currentUserId);
    }

    /** 是否 V3 流程版本（与 RdmFlowVersionGuard 同口径：仅认 3） */
    private boolean isV3(Integer flowVersion) {
        return flowVersion != null && flowVersion == RdmConstants.FLOW_VERSION_3;
    }

    /**
     * 从 reqId 沿 structureParentReqId 向上重走，检测是否已成环（重复访问即环）。
     * <p>用于绑定写入后的并发后置复检，防御两个反向绑定并发提交后各自前置检查都通过却合成环。
     */
    private boolean hasCycleFrom(Long reqId) {
        Set<Long> seen = new HashSet<>();
        Long cursor = reqId;
        int depth = 0;
        while (cursor != null && depth < MAX_ANCESTOR_DEPTH) {
            if (!seen.add(cursor)) {
                return true;
            }
            RdmRequirement req = requirementMapper.selectById(cursor);
            if (req == null) {
                break;
            }
            cursor = req.getStructureParentReqId();
            depth++;
        }
        return false;
    }

    /**
     * 移除子需求的结构关系。
     * <p>只允许解除确实挂在该父下的子需求，避免误改他人结构。
     */
    @Transactional(rollbackFor = Exception.class)
    public void removeChildRequirement(Long parentReqId, Long childReqId, Long currentUserId) {
        if (parentReqId == null || childReqId == null) {
            throw new BusinessException("父需求與子需求不能為空");
        }
        accessGuard.requireDeliveryWriter(parentReqId, "維護需求結構");

        RdmRequirement child = requireReq(childReqId);
        if (!parentReqId.equals(child.getStructureParentReqId())) {
            throw new BusinessException("該需求未掛在此父需求下，無需移除");
        }
        // updateById 默认忽略 null 字段，结构父置空必须走显式 UpdateWrapper
        requirementMapper.update(null, new com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper<RdmRequirement>()
                .eq(RdmRequirement::getId, childReqId)
                .set(RdmRequirement::getStructureParentReqId, null));
        log.info("移除結構子需求: parentReqId={}, childReqId={}, operator={}", parentReqId, childReqId, currentUserId);
    }

    /* ==================== 查询 ==================== */

    /**
     * 获取需求树（以 reqId 为根，返回其直接子节点集合；根自身通过 {@link #getAncestorChain} 或详情获取）。
     * <p>返回嵌套结构，最大深度 {@value #MAX_TREE_DEPTH} 层，防御脏数据成环导致的无限递归。
     */
    public List<RequirementTreeNode> getRequirementTree(Long reqId) {
        if (reqId == null) {
            return List.of();
        }
        return loadChildren(reqId, 1);
    }

    /**
     * 获取祖先链（从根到当前需求，含当前需求自身）。
     * <p>沿 structureParentReqId 向上回溯，最多 {@value #MAX_ANCESTOR_DEPTH} 层。
     */
    public List<RequirementTreeNode> getAncestorChain(Long reqId) {
        if (reqId == null) {
            return List.of();
        }
        List<RdmRequirement> chain = new ArrayList<>();
        Long cursor = reqId;
        int depth = 0;
        while (cursor != null && depth < MAX_ANCESTOR_DEPTH) {
            RdmRequirement req = requirementMapper.selectById(cursor);
            if (req == null) {
                break;
            }
            chain.add(req);
            cursor = req.getStructureParentReqId();
            depth++;
        }
        Collections.reverse(chain); // 根在前，当前在后
        List<RequirementTreeNode> nodes = new ArrayList<>();
        for (RdmRequirement req : chain) {
            nodes.add(toNode(req));
        }
        return nodes;
    }

    /**
     * 环检测：如果将 newParentId 设为 reqId 的结构父，是否产生环。
     * <p>从 newParentId 向上回溯，若能到达 reqId，说明 reqId 本就是 newParentId 的祖先，成环。
     */
    public boolean wouldCreateCycle(Long reqId, Long newParentId) {
        if (reqId == null || newParentId == null) {
            return false;
        }
        if (reqId.equals(newParentId)) {
            return true;
        }
        Long cursor = newParentId;
        int depth = 0;
        while (cursor != null && depth < MAX_ANCESTOR_DEPTH) {
            if (cursor.equals(reqId)) {
                return true;
            }
            RdmRequirement req = requirementMapper.selectById(cursor);
            if (req == null) {
                break;
            }
            cursor = req.getStructureParentReqId();
            depth++;
        }
        return false;
    }

    /* ==================== 内部工具 ==================== */

    /** 递归加载子节点（depth 从 1 起，超过 MAX_TREE_DEPTH 停止下探） */
    private List<RequirementTreeNode> loadChildren(Long parentReqId, int depth) {
        if (depth > MAX_TREE_DEPTH) {
            return List.of();
        }
        List<RdmRequirement> children = requirementMapper.selectList(new LambdaQueryWrapper<RdmRequirement>()
                .eq(RdmRequirement::getStructureParentReqId, parentReqId)
                .orderByAsc(RdmRequirement::getId));
        List<RequirementTreeNode> nodes = new ArrayList<>();
        for (RdmRequirement child : children) {
            RequirementTreeNode node = toNode(child);
            node.setChildren(loadChildren(child.getId(), depth + 1));
            nodes.add(node);
        }
        return nodes;
    }

    private RequirementTreeNode toNode(RdmRequirement req) {
        RequirementTreeNode node = new RequirementTreeNode();
        node.setReqId(req.getId());
        node.setReqNo(req.getReqNo());
        node.setTitle(req.getTitle());
        node.setRequirementKind(req.getRequirementKind());
        node.setStatus(req.getStatus());
        Long reqId = req.getId();
        long total = reqId == null ? 0 : deliveryItemMapper.selectCount(new LambdaQueryWrapper<RdmDeliveryItem>()
                .eq(RdmDeliveryItem::getReqId, reqId));
        long done = reqId == null ? 0 : deliveryItemMapper.selectCount(new LambdaQueryWrapper<RdmDeliveryItem>()
                .eq(RdmDeliveryItem::getReqId, reqId)
                .eq(RdmDeliveryItem::getStatus, RdmConstants.DI_DONE));
        node.setDeliveryItemCount((int) total);
        node.setDeliveryDoneCount((int) done);
        node.setChildren(new ArrayList<>());
        return node;
    }

    private RdmRequirement requireReq(Long reqId) {
        RdmRequirement req = reqId == null ? null : requirementMapper.selectById(reqId);
        if (req == null) {
            throw new BusinessException("需求不存在或已刪除");
        }
        return req;
    }

    /** 需求树节点（聚合进度用） */
    @Data
    public static class RequirementTreeNode {
        private Long reqId;
        private String reqNo;
        private String title;
        private String requirementKind;
        private String status;
        private Integer deliveryItemCount;
        private Integer deliveryDoneCount;
        private List<RequirementTreeNode> children;
    }
}
