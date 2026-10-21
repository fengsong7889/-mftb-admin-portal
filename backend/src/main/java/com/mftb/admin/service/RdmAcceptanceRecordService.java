package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.mftb.admin.common.BusinessException;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.dto.RdmAcceptanceRecordDTO;
import com.mftb.admin.dto.RdmAcceptanceRecordVO;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmRequirement;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.DateTimeUtils;
import com.mftb.admin.util.JsonUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

/**
 * RDM 交付项级验收记录服务（Batch 1 创建，Batch 3 / 任务20 强化双路径与四眼口径）。
 * <p>验收分两类两阶段：product(产品验收) × business(业务验收)；pre_release × post_release。
 * <p>任务20 落地的双路径（以交付项 acceptancePath 为权威）：
 * <ul>
 *   <li><b>路径 A（先验收后上线）</b>：测试通过 → 产品验收 pre_release → 业务验收 pre_release + 正式评分 →（发布属任务21）→ 完成；</li>
 *   <li><b>路径 B（先上线后业务验收）</b>：测试通过 → 产品验收 pre_release →（发布/开放属任务21）→ 业务验收 post_release + 正式评分 → 完成。</li>
 * </ul>
 * <p>签字人身份由服务端按交付项上的验收人字段校验（来自认证主体 SysUser.id），前端传谁不算数；
 * <b>任务19 / 决策3：签署类守卫已取消 admin 直通，管理员不得代业务签字 / 自批</b>；四眼原则要求产品签署人 ≠ 业务签署人。
 * <p>放行闸门（{@link #hasProductAcceptancePassed}/{@link #hasBizAcceptancePassed}）取当前 scopeVersion 下
 * <b>最新有效结论=pass</b>（conditional/fail 不算通过，已因范围变更失效的记录不参与）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RdmAcceptanceRecordService {

    private static final String SEQ_ACCEPTANCE_RECORD = "rdm_acceptance_record";

    /** executeOnce 业务类型：提交验收结论（Batch 3 原子幂等） */
    private static final String BIZ_ACCEPT_SUBMIT = "rdm_accept_submit";

    /**
     * 业务验收附条件通过的结构化条件必填字段（B.5）：条件/期限/责任人。
     * <p>供任务23 前端消费：conditionsJson 为非空 JSON 数组，每元素含 condition/deadline/owner（兼容中文别名）。
     */
    private static final List<String> CONDITION_KEYS = List.of("condition", "deadline", "owner");

    private final RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private final RdmDeliveryItemMapper deliveryItemMapper;
    private final RdmRequirementMapper requirementMapper;
    private final BizSeqService bizSeqService;
    private final RdmAccessGuard accessGuard;
    /** B.4 验收前置：测试必须已通过（单向依赖 RdmTestBatchService，无循环） */
    private final RdmTestBatchService testBatchService;
    /** B.6 消费证据失效：任务33 统一委派共享解析器，范围变更后旧验收记录登记失效即不再作为门禁凭证 */
    private final EvidenceValidityResolver evidenceValidityResolver;
    /** B.10 提交验收接入原子幂等 executeOnce */
    private final RdmIdempotentService idempotentService;
    /**
     * 任务27 新增（增量构造变更，置于末位以免打乱既有构造参数序）：
     * 开放事实的<b>只读</b>判定。本服务仅委派，不写任何发布表，因此不引入循环依赖。
     */
    private final RdmOpenFactService openFactService;
    /**
     * 验收写入后重算交付项状态（置于末位以免打乱既有构造参数序）。
     * <p>recalculateStatus 原先只在手动接口与新范围版本时触发，验收通过后交付项会停在
     * pending_acceptance（展示与验收队列陈旧，闸门读数却已通过）；验收写入后必须同步一次。
     * <p>无循环依赖：RdmDeliveryItemService 只依赖 Mapper 与共享解析器。
     */
    private final RdmDeliveryItemService deliveryItemService;

    /* ==================== 查询 ==================== */

    /** 验收记录分页列表 */
    public Page<RdmAcceptanceRecordVO.ListItem> listRecords(RdmAcceptanceRecordDTO.Query query, Long currentUserId) {
        RdmAcceptanceRecordDTO.Query q = query == null ? new RdmAcceptanceRecordDTO.Query() : query;
        LambdaQueryWrapper<RdmAcceptanceRecord> wrapper = new LambdaQueryWrapper<>();
        if (q.getDeliveryItemId() != null) {
            wrapper.eq(RdmAcceptanceRecord::getDeliveryItemId, q.getDeliveryItemId());
        }
        if (q.getReqId() != null) {
            wrapper.eq(RdmAcceptanceRecord::getReqId, q.getReqId());
        }
        if (StringUtils.hasText(q.getAcceptanceType())) {
            wrapper.eq(RdmAcceptanceRecord::getAcceptanceType, q.getAcceptanceType());
        }
        if (StringUtils.hasText(q.getStage())) {
            wrapper.eq(RdmAcceptanceRecord::getStage, q.getStage());
        }
        if (q.getSignerUserId() != null) {
            wrapper.eq(RdmAcceptanceRecord::getSignerUserId, q.getSignerUserId());
        }
        wrapper.orderByDesc(RdmAcceptanceRecord::getCreatedAt);

        Page<RdmAcceptanceRecord> page = new Page<>(normalizePage(q.getPageNo()), normalizeSize(q.getPageSize()));
        Page<RdmAcceptanceRecord> result = acceptanceRecordMapper.selectPage(page, wrapper);

        // 批量加载关联标题
        List<RdmAcceptanceRecord> records = result.getRecords();
        List<Long> itemIds = records.stream().map(RdmAcceptanceRecord::getDeliveryItemId).filter(Objects::nonNull).distinct().toList();
        Map<Long, String> itemTitleMap = loadItemTitles(itemIds);
        List<Long> reqIds = records.stream().map(RdmAcceptanceRecord::getReqId).filter(Objects::nonNull).distinct().toList();
        Map<Long, String> reqTitleMap = loadReqTitles(reqIds);

        Page<RdmAcceptanceRecordVO.ListItem> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(records.stream().map(r -> {
            RdmAcceptanceRecordVO.ListItem vo = new RdmAcceptanceRecordVO.ListItem();
            vo.setId(r.getId());
            vo.setRecordNo(r.getRecordNo());
            vo.setDeliveryItemId(r.getDeliveryItemId());
            vo.setDeliveryItemTitle(itemTitleMap.getOrDefault(r.getDeliveryItemId(), ""));
            vo.setReqId(r.getReqId());
            vo.setReqTitle(reqTitleMap.getOrDefault(r.getReqId(), ""));
            vo.setAcceptanceType(r.getAcceptanceType());
            vo.setStage(r.getStage());
            vo.setConclusion(r.getConclusion());
            vo.setScore(r.getScore());
            vo.setSignerUserName(r.getSignerUserName());
            vo.setRoundNo(r.getRoundNo());
            vo.setCreatedAt(DateTimeUtils.format(r.getCreatedAt()));
            return vo;
        }).toList());
        return voPage;
    }

    /**
     * 验收记录详情（B.9 记录归属核对）。
     * <p>recordId 必须与路径上的 deliveryItemId 核对一致，防止前端用一个合法 recordId 翻别的交付项验收单（越权）。
     */
    public RdmAcceptanceRecordVO.Detail getRecordDetail(Long recordId, Long deliveryItemId) {
        RdmAcceptanceRecord record = requireRecord(recordId);
        if (deliveryItemId != null && !deliveryItemId.equals(record.getDeliveryItemId())) {
            throw new BusinessException("驗收記錄不屬於該交付項，拒絕訪問（記錄歸屬核對不一致）: recordId="
                    + recordId + ", 路徑deliveryItemId=" + deliveryItemId + ", 記錄deliveryItemId=" + record.getDeliveryItemId());
        }
        RdmAcceptanceRecordVO.Detail vo = new RdmAcceptanceRecordVO.Detail();
        vo.setId(record.getId());
        vo.setRecordNo(record.getRecordNo());
        vo.setDeliveryItemId(record.getDeliveryItemId());
        if (record.getDeliveryItemId() != null) {
            RdmDeliveryItem item = deliveryItemMapper.selectById(record.getDeliveryItemId());
            if (item != null) {
                vo.setDeliveryItemTitle(item.getTitle());
            }
        }
        vo.setReqId(record.getReqId());
        if (record.getReqId() != null) {
            RdmRequirement req = requirementMapper.selectById(record.getReqId());
            if (req != null) {
                vo.setReqTitle(req.getTitle());
            }
        }
        vo.setAcceptanceType(record.getAcceptanceType());
        vo.setStage(record.getStage());
        vo.setConclusion(record.getConclusion());
        vo.setScore(record.getScore());
        vo.setSignerUserName(record.getSignerUserName());
        vo.setRoundNo(record.getRoundNo());
        vo.setCreatedAt(DateTimeUtils.format(record.getCreatedAt()));
        vo.setScopeVersion(record.getScopeVersion());
        vo.setBuildId(record.getBuildId());
        vo.setTestEnv(record.getTestEnv());
        vo.setOpinion(record.getOpinion());
        vo.setConditionsJson(record.getConditionsJson());
        vo.setEvidenceJson(record.getEvidenceJson());
        return vo;
    }

    /* ==================== 写入 ==================== */

    /**
     * 提交验收结论（B.10 executeOnce 幂等入口）。
     * <p>服务端派生键：resourceKey={@code delivery_item:{id}}，
     * clientRequestId={@code accept:{type}:{stage}:{判别子}}（判别子优先 DTO.requestId，缺省退化为内容稳定哈希），
     * requestHash=验收内容稳定哈希。executeOnce 自身即事务边界，实际逻辑落在 {@link #doSubmitAcceptance}。
     */
    public RdmAcceptanceRecord submitAcceptance(Long deliveryItemId, RdmAcceptanceRecordDTO.Submit dto,
                                                Long currentUserId, String currentUserName) {
        validateEnums(dto); // B.1 白名单前置校验（不合法直接拒，不开幂等占位）
        if (currentUserId == null) {
            throw new BusinessException("登錄狀態失效，請重新登錄");
        }
        if (deliveryItemId == null) {
            throw new BusinessException("交付項不能為空");
        }
        String type = dto.getAcceptanceType().trim();
        String stage = dto.getStage().trim();
        String conclusion = dto.getConclusion().trim();
        String discriminator = StringUtils.hasText(dto.getRequestId()) ? dto.getRequestId().trim()
                : idempotentService.stableRequestHash(List.of("accept-content", String.valueOf(deliveryItemId),
                        type, stage, conclusion, String.valueOf(dto.getScore()),
                        String.valueOf(dto.getScopeVersion()), String.valueOf(currentUserId)));
        IdempotentKey key = IdempotentKey.builder()
                .userId(currentUserId)
                .bizType(BIZ_ACCEPT_SUBMIT)
                .resourceKey("delivery_item:" + deliveryItemId)
                .clientRequestId("accept:" + type + ":" + stage + ":" + discriminator)
                .requestHash(idempotentService.stableRequestHash(List.of("accept", String.valueOf(deliveryItemId),
                        type, stage, conclusion, String.valueOf(currentUserId))))
                .build();
        return idempotentService.executeOnce(key,
                () -> doSubmitAcceptance(deliveryItemId, dto, currentUserId, currentUserName), RdmAcceptanceRecord.class);
    }

    /**
     * 提交验收结论的实际逻辑（事务内）。
     * <p>落地 B 段全部强制口径：白名单校验、签署身份/四眼、测试通过前置、路径与顺序、
     * open 事实门禁（路径B post_release）、conditional 语义、scopeVersion 权威、业务正式评分。
     */
    @Transactional(rollbackFor = Exception.class)
    public RdmAcceptanceRecord doSubmitAcceptance(Long deliveryItemId, RdmAcceptanceRecordDTO.Submit dto,
                                                  Long currentUserId, String currentUserName) {
        validateEnums(dto); // B.1
        RdmDeliveryItem item = deliveryItemId == null ? null : deliveryItemMapper.selectById(deliveryItemId);
        if (item == null) {
            throw new BusinessException("交付項不存在");
        }
        String type = dto.getAcceptanceType().trim();
        String stage = dto.getStage().trim();
        String conclusion = dto.getConclusion().trim();

        // B.8 签署身份来自认证主体 SysUser.id（前端不能指定签署人）；四眼/无 admin 代签由 accessGuard fail-closed 保证
        validateSignerIdentity(item, type, currentUserId);

        // B.6 scopeVersion 以交付项当前范围版本为权威，客户端传值不一致即拒绝（不信任前端）
        Integer authoritativeScope = item.getScopeVersion();
        if (dto.getScopeVersion() != null && !dto.getScopeVersion().equals(authoritativeScope)) {
            throw new BusinessException("scopeVersion 以交付項當前範圍版本為權威，客戶端傳值不一致，拒絕提交：傳入="
                    + dto.getScopeVersion() + "，當前=" + authoritativeScope);
        }

        // B.4 验收前置：测试必须已通过（服务端事实，非 QA 任务进度推导）
        if (!testBatchService.isTestPassed(deliveryItemId)) {
            throw new BusinessException("測試尚未通過，不能進行驗收（驗收前置：isTestPassed 必須為真）");
        }

        // B.2/B.3/B.4 路径与顺序强制（产品先于业务；路径决定业务验收阶段；B 路径 post_release gate 在 open 事实之后；四眼）
        enforcePathAndOrder(item, type, stage, deliveryItemId, currentUserId, authoritativeScope);

        // B.5 conditional 语义：业务验收 conditional 必须带结构化条件（条件/期限/责任人），缺则拒绝
        enforceConditional(type, conclusion, dto.getConditionsJson());

        // B.7 业务验收必须正式评分 1-5（产品评分独立、可选）
        if (RdmConstants.ACCEPTANCE_TYPE_BUSINESS.equals(type)) {
            if (dto.getScore() == null || dto.getScore() < RdmConstants.SCORE_MIN || dto.getScore() > RdmConstants.SCORE_MAX) {
                throw new BusinessException("業務驗收必須填寫 1-5 分正式滿意度評分");
            }
        }

        int roundNo = computeRoundNo(deliveryItemId, type, stage);
        RdmAcceptanceRecord record = new RdmAcceptanceRecord();
        record.setRecordNo(bizSeqService.next(SEQ_ACCEPTANCE_RECORD));
        record.setDeliveryItemId(deliveryItemId);
        record.setReqId(item.getReqId());
        record.setAcceptanceType(type);
        record.setStage(stage);
        record.setScopeVersion(authoritativeScope);
        record.setBuildId(dto.getBuildId());
        record.setTestEnv(dto.getTestEnv());
        record.setConclusion(conclusion);
        record.setScore(dto.getScore());
        record.setOpinion(dto.getOpinion());
        record.setSignerUserId(currentUserId);
        record.setSignerUserName(currentUserName);
        record.setRoundNo(roundNo);
        record.setConditionsJson(dto.getConditionsJson());
        record.setEvidenceJson(dto.getEvidenceJson());
        acceptanceRecordMapper.insert(record);
        /*
         * 验收事实变了，交付项状态立即重算：否则验收通过后交付项仍停在 pending_acceptance，
         * V3 阶段条会把「待验收」继续画在头上（实际闸门读数已经通过）。
         */
        deliveryItemService.recalculateStatus(deliveryItemId);
        log.info("提交驗收結論: recordNo={}, itemId={}, type={}, stage={}, conclusion={}, scope={}, signer={}",
                record.getRecordNo(), deliveryItemId, type, stage, conclusion, authoritativeScope, currentUserId);
        return record;
    }

    /**
     * B.4 保守判定入口：交付项是否已建立「开放事实」（上线后开放/放量）。
     * <p><b>任务27 已接真实事实</b>：委派给 {@link RdmOpenFactService}，成立条件为
     * 「存在 released 批次且范围快照包含本交付项 + 部署 open_status=opened
     * + 存在 {@code action=open, result=opened} 的追加事实 + 无更晚的 rollback 事实」。
     * <p><b>回滚后本方法回 false</b>（批次转 rolled_back 且/或存在更晚 rollback 事实），
     * 使路径B 的 {@code post_release} 业务验收被重新门禁，不会因一次已回滚的上线而永久放行。
     * <p>保持 protected 签名与门禁编排不变：单测仍可通过 spy 覆盖验证「已建立开放事实」分支。
     */
    protected boolean isOpenFactEstablished(Long deliveryItemId) {
        return openFactService != null && openFactService.isOpenFactEstablished(deliveryItemId);
    }

    /** B.1 白名单校验：acceptanceType∈{product,business}；stage∈{pre_release,post_release}；conclusion∈{pass,fail,conditional}。 */
    private void validateEnums(RdmAcceptanceRecordDTO.Submit dto) {
        if (dto == null) {
            throw new BusinessException("請求體不能為空");
        }
        String type = trimToNull(dto.getAcceptanceType());
        if (type == null) {
            throw new BusinessException("驗收類型不能為空");
        }
        if (!RdmConstants.ACCEPTANCE_TYPE_PRODUCT.equals(type) && !RdmConstants.ACCEPTANCE_TYPE_BUSINESS.equals(type)) {
            throw new BusinessException("非法的驗收類型（僅 product/business）: " + type);
        }
        String stage = trimToNull(dto.getStage());
        if (stage == null) {
            throw new BusinessException("驗收階段不能為空");
        }
        if (!RdmConstants.ACCEPT_STAGE_PRE.equals(stage) && !RdmConstants.ACCEPT_STAGE_POST.equals(stage)) {
            throw new BusinessException("非法的驗收階段（僅 pre_release/post_release）: " + stage);
        }
        String conclusion = trimToNull(dto.getConclusion());
        if (conclusion == null) {
            throw new BusinessException("驗收結論不能為空");
        }
        if (!RdmConstants.ACCEPT_PASS.equals(conclusion) && !RdmConstants.ACCEPT_FAIL.equals(conclusion)
                && !RdmConstants.ACCEPT_CONDITIONAL.equals(conclusion)) {
            throw new BusinessException("非法的驗收結論（僅 pass/fail/conditional）: " + conclusion);
        }
    }

    /**
     * B.2/B.3/B.4 路径与顺序强制。
     * <ul>
     *   <li>产品验收固定 pre_release（A/B 两路径均为上线前预验收）；</li>
     *   <li>业务验收阶段由路径决定：A→pre_release；B→post_release；</li>
     *   <li>B 路径 post_release 业务验收必须 gate 在开放事实之后（任务21，无则拒绝）；</li>
     *   <li>业务验收前必须已有最新有效产品验收且结论=pass（conditional 不算通过）；</li>
     *   <li>四眼：业务签署人 ≠ 产品签署人。</li>
     * </ul>
     */
    private void enforcePathAndOrder(RdmDeliveryItem item, String type, String stage,
                                     Long deliveryItemId, Long currentUserId, Integer scopeVersion) {
        if (RdmConstants.ACCEPTANCE_TYPE_PRODUCT.equals(type)) {
            if (!RdmConstants.ACCEPT_STAGE_PRE.equals(stage)) {
                throw new BusinessException("產品驗收必須在上線前（pre_release）進行，非法階段: " + stage);
            }
            return;
        }
        // 业务验收
        String path = item.getAcceptancePath();
        if (RdmConstants.PATH_A.equals(path)) {
            if (!RdmConstants.ACCEPT_STAGE_PRE.equals(stage)) {
                throw new BusinessException("路徑A的業務驗收必須在上線前（pre_release），非法階段: " + stage);
            }
        } else if (RdmConstants.PATH_B.equals(path)) {
            if (!RdmConstants.ACCEPT_STAGE_POST.equals(stage)) {
                throw new BusinessException("路徑B的業務驗收必須在上線後（post_release），非法階段: " + stage);
            }
            if (!isOpenFactEstablished(deliveryItemId)) {
                throw new BusinessException("路徑B的上線後業務驗收必須在「開放事實」建立之後才可進行；當前無開放事實，拒絕（發布/開放屬任務21）");
            }
        } else {
            throw new BusinessException("交付項未配置驗收路徑（A/B），無法進行業務驗收");
        }
        // B.4 产品验收必须在业务验收之前：最新有效产品验收结论必须=pass（conditional 不算通过）
        RdmAcceptanceRecord latestProduct = latestValidAcceptance(
                deliveryItemId, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, scopeVersion);
        if (latestProduct == null || !RdmConstants.ACCEPT_PASS.equals(latestProduct.getConclusion())) {
            throw new BusinessException("業務驗收前必須先完成產品驗收且結論為 pass（產品驗收 conditional 不算通過）");
        }
        // B.8 四眼：业务签署人不得与产品签署人为同一人
        if (latestProduct.getSignerUserId() != null && latestProduct.getSignerUserId().equals(currentUserId)) {
            throw new BusinessException("四眼原則：業務驗收簽署人不得與產品驗收簽署人為同一人");
        }
    }

    /** B.5 conditional 语义：业务验收 conditional 必须带结构化条件（条件/期限/责任人），缺则拒绝；产品验收 conditional 不算通过（门禁只认 pass）。 */
    private void enforceConditional(String type, String conclusion, String conditionsJson) {
        if (!RdmConstants.ACCEPT_CONDITIONAL.equals(conclusion)) {
            return;
        }
        if (RdmConstants.ACCEPTANCE_TYPE_BUSINESS.equals(type)) {
            requireStructuredConditions(conditionsJson);
        }
    }

    /** 结构化整改条件校验：conditionsJson 为非空 JSON 数组，每元素含 条件/期限/责任人（condition/deadline/owner）。 */
    private void requireStructuredConditions(String conditionsJson) {
        if (!StringUtils.hasText(conditionsJson)) {
            throw new BusinessException("業務驗收附條件通過（conditional）必須填寫結構化整改條件（conditionsJson）");
        }
        List<Map<String, Object>> conditions = JsonUtils.parseMapList(conditionsJson);
        if (conditions.isEmpty()) {
            throw new BusinessException("業務驗收附條件通過的條件不能為空（conditionsJson 需為非空 JSON 數組）");
        }
        for (Map<String, Object> c : conditions) {
            for (String key : CONDITION_KEYS) {
                if (!hasConditionField(c, key)) {
                    throw new BusinessException("業務驗收附條件通過的每一條條件必須含 條件/期限/責任人（condition/deadline/owner）");
                }
            }
        }
    }

    private boolean hasConditionField(Map<String, Object> c, String key) {
        Object v = c.get(key);
        if (v == null) {
            String alias = switch (key) {
                case "condition" -> "條件";
                case "deadline" -> "期限";
                case "owner" -> "責任人";
                default -> key;
            };
            v = c.get(alias);
        }
        return v != null && StringUtils.hasText(v.toString());
    }

    /* ==================== 放行闸门查询 ==================== */

    /**
     * 产品验收是否通过（用于发布放行闸门检查）。
     * <p>B.5/B.6 口径：取该交付项 + 当前 scopeVersion 下<b>最新的有效（未失效）产品验收结论</b>，
     * 仅当 conclusion=pass 才算通过；conditional/fail 均不算通过（非历史任意 pass）。
     */
    public boolean hasProductAcceptancePassed(Long deliveryItemId, Integer scopeVersion) {
        return isAcceptancePassed(deliveryItemId, RdmConstants.ACCEPTANCE_TYPE_PRODUCT, scopeVersion);
    }

    /**
     * 业务验收是否通过（用于发布放行闸门检查 / 需求关闭前置）。
     * <p>B.5/B.6 口径同 {@link #hasProductAcceptancePassed}：最新有效业务验收结论=pass 才算通过。
     */
    public boolean hasBizAcceptancePassed(Long deliveryItemId, Integer scopeVersion) {
        return isAcceptancePassed(deliveryItemId, RdmConstants.ACCEPTANCE_TYPE_BUSINESS, scopeVersion);
    }

    /** 门禁判定：当前 scopeVersion 下最新有效结论=pass（conditional 不算通过，失效记录不参与）。 */
    private boolean isAcceptancePassed(Long deliveryItemId, String type, Integer scopeVersion) {
        if (deliveryItemId == null) {
            return false;
        }
        RdmAcceptanceRecord latest = latestValidAcceptance(deliveryItemId, type, scopeVersion);
        return latest != null && RdmConstants.ACCEPT_PASS.equals(latest.getConclusion());
    }

    /**
     * B.6 最新适用证据：取该交付项+类型+scopeVersion 下未失效的最新一条验收记录（按 createdAt 后 id 降序）。
     * <p>非“历史任意 pass”：若最新一条为 fail/conditional，则早期 pass 不再作为门禁凭证。
     */
    private RdmAcceptanceRecord latestValidAcceptance(Long deliveryItemId, String type, Integer scopeVersion) {
        return loadValidAcceptanceRecords(deliveryItemId).stream()
                .filter(r -> type == null || type.equals(r.getAcceptanceType()))
                .filter(r -> scopeVersion == null || scopeVersion.equals(r.getScopeVersion()))
                .max(Comparator
                        .comparing(RdmAcceptanceRecord::getCreatedAt, Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(RdmAcceptanceRecord::getId, Comparator.nullsFirst(Comparator.naturalOrder())))
                .orElse(null);
    }

    /**
     * B.6 失效过滤：范围变更后登记失效的验收记录不再有效。
     * <p>任务33：全量记录仍按本服务口径加载，失效过滤委派共享 {@link EvidenceValidityResolver}
     * （与 {@link RdmDeliveryItemService}、{@link RdmTestBatchService} 三处共用同一实现，杜绝漂移）。
     */
    private List<RdmAcceptanceRecord> loadValidAcceptanceRecords(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return List.of();
        }
        List<RdmAcceptanceRecord> all = acceptanceRecordMapper.selectList(new LambdaQueryWrapper<RdmAcceptanceRecord>()
                .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId));
        return evidenceValidityResolver.validAcceptanceRecords(deliveryItemId, all);
    }

    private static String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    /* ==================== 内部工具 ==================== */

    private RdmAcceptanceRecord requireRecord(Long id) {
        RdmAcceptanceRecord record = id == null ? null : acceptanceRecordMapper.selectById(id);
        if (record == null) {
            throw new BusinessException("驗收記錄不存在");
        }
        return record;
    }

    /**
     * 签字人身份校验：
     * product 类型 → 产品验收人；business 类型 → 业务验收人。
     * <p>任务19 / 决策3：签署类守卫已取消 admin 直通，管理员不再能代签 / 自批；
     * 可见范围与签署资格分离，具体资格判定由 accessGuard.requireProductAcceptor / requireBizAcceptor 负责。
     */
    private void validateSignerIdentity(RdmDeliveryItem item, String acceptanceType, Long currentUserId) {
        if (RdmConstants.ACCEPTANCE_TYPE_PRODUCT.equals(acceptanceType)) {
            accessGuard.requireProductAcceptor(item.getId(), currentUserId);
        } else if (RdmConstants.ACCEPTANCE_TYPE_BUSINESS.equals(acceptanceType)) {
            accessGuard.requireBizAcceptor(item.getId(), currentUserId);
        } else {
            throw new BusinessException("不支持的驗收類型: " + acceptanceType);
        }
    }

    private int computeRoundNo(Long deliveryItemId, String acceptanceType, String stage) {
        Long count = acceptanceRecordMapper.selectCount(new LambdaQueryWrapper<RdmAcceptanceRecord>()
                .eq(RdmAcceptanceRecord::getDeliveryItemId, deliveryItemId)
                .eq(RdmAcceptanceRecord::getAcceptanceType, acceptanceType)
                .eq(RdmAcceptanceRecord::getStage, stage));
        return (count == null ? 0 : count.intValue()) + 1;
    }

    private Map<Long, String> loadItemTitles(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty()) return Map.of();
        return deliveryItemMapper.selectBatchIds(itemIds).stream()
                .collect(Collectors.toMap(RdmDeliveryItem::getId, i -> i.getTitle() == null ? "" : i.getTitle(), (a, b) -> a));
    }

    private Map<Long, String> loadReqTitles(List<Long> reqIds) {
        if (reqIds == null || reqIds.isEmpty()) return Map.of();
        return requirementMapper.selectBatchIds(reqIds).stream()
                .collect(Collectors.toMap(RdmRequirement::getId, r -> r.getTitle() == null ? "" : r.getTitle(), (a, b) -> a));
    }

    private long normalizePage(Integer pageNo) {
        return pageNo == null || pageNo < 1 ? 1 : pageNo;
    }

    private long normalizeSize(Integer pageSize) {
        if (pageSize == null || pageSize < 1) return 20;
        return Math.min(pageSize, 200);
    }
}
