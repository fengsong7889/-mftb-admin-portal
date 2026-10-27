package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmEvidenceInvalidation;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * 范围变更「证据失效过滤」的唯一共享解析器（任务33 抽取，偿还任务19/20 起标注的技术债）。
 *
 * <p>背景：交付项范围版本变更（scope_version+1）后，旧的测试批次 / 验收记录 / 发布检查基于旧范围，
 * 只登记一条 {@link RdmEvidenceInvalidation}「因范围变更而失效」的记录、<b>不删除</b>（保留历史留痕）。
 * 因此所有推导状态、门禁放行、证据回显的查询都必须先加载「已失效证据 id 集合」并剔除，
 * 否则按旧范围验过的证据会继续被当作当前范围的有效凭证。
 *
 * <p>此语义此前在 {@link RdmDeliveryItemService}、{@link RdmTestBatchService}、{@link RdmAcceptanceRecordService}
 * 三处各自复刻（loadInvalidatedEvidenceIds / loadInvalidatedBatchIds / loadInvalidatedAcceptanceIds + 过滤循环），
 * 存在漂移风险。本组件将其收敛为单一实现，三处一律委派，杜绝重复。
 *
 * <p><b>依赖约束</b>：本组件<b>只依赖 {@link RdmEvidenceInvalidationMapper}</b>（只读失效登记表），
 * 不反向依赖任何业务 Service，故不会引入循环依赖；「加载全量证据」因各 Service 口径不同
 * （排序、JSON 数组关联、未过滤复用等），仍由各 Service 自行加载后传入本组件过滤，
 * 以保证抽取前后外部可观察行为完全一致（纯内部重构）。
 */
@Component
@RequiredArgsConstructor
public class EvidenceValidityResolver {

    private final RdmEvidenceInvalidationMapper evidenceInvalidationMapper;

    /**
     * 加载某交付项下「因范围变更而失效」的指定类型证据 id 集合。
     * <p>三处消费点（状态推导 / 测试放行门禁 / 验收放行门禁）此前各自复刻同一查询，现统一到此。
     *
     * @param deliveryItemId 交付项 id，为空返回空集
     * @param evidenceType   证据类型：{@link RdmEvidenceInvalidation#TYPE_TEST_BATCH} /
     *                       {@link RdmEvidenceInvalidation#TYPE_ACCEPTANCE} /
     *                       {@link RdmEvidenceInvalidation#TYPE_RELEASE_CHECK}
     * @return 已失效证据 id 集合（去重、剔除非空 evidenceId）
     */
    public Set<Long> invalidatedEvidenceIds(Long deliveryItemId, String evidenceType) {
        if (deliveryItemId == null) {
            return Set.of();
        }
        return evidenceInvalidationMapper.selectList(new LambdaQueryWrapper<RdmEvidenceInvalidation>()
                        .eq(RdmEvidenceInvalidation::getDeliveryItemId, deliveryItemId)
                        .eq(RdmEvidenceInvalidation::getEvidenceType, evidenceType))
                .stream()
                .map(RdmEvidenceInvalidation::getEvidenceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    /**
     * 某交付项是否存在任意「范围变更导致的证据失效」记录。
     * <p>供状态回退闸门使用：只有确因范围变更使旧证据失效，才允许把交付项状态打回，
     * 避免下游事实短暂抖动造成状态来回跳。
     */
    public boolean hasAnyInvalidation(Long deliveryItemId) {
        if (deliveryItemId == null) {
            return false;
        }
        return evidenceInvalidationMapper.selectCount(new LambdaQueryWrapper<RdmEvidenceInvalidation>()
                .eq(RdmEvidenceInvalidation::getDeliveryItemId, deliveryItemId)) > 0;
    }

    /**
     * 从传入的全量测试批次中剔除「因范围变更失效」者，返回仍然有效的批次。
     * <p>全量批次由调用方按其自身口径加载（如按 delivery_item_ids_json 关联过滤）后传入，
     * 本方法只负责失效过滤，语义与三处原私有实现完全一致。
     */
    public List<RdmTestBatch> validTestBatches(Long deliveryItemId, List<RdmTestBatch> allBatches) {
        return retainValid(allBatches,
                invalidatedEvidenceIds(deliveryItemId, RdmEvidenceInvalidation.TYPE_TEST_BATCH),
                RdmTestBatch::getId);
    }

    /**
     * 从传入的全量验收记录中剔除「因范围变更失效」者，返回仍然有效的记录。
     * <p>全量记录由调用方按其自身口径加载（含各自的排序）后传入，本方法只负责失效过滤。
     */
    public List<RdmAcceptanceRecord> validAcceptanceRecords(Long deliveryItemId, List<RdmAcceptanceRecord> allRecords) {
        return retainValid(allRecords,
                invalidatedEvidenceIds(deliveryItemId, RdmEvidenceInvalidation.TYPE_ACCEPTANCE),
                RdmAcceptanceRecord::getId);
    }

    /**
     * 通用失效过滤：保留 id 不在失效集合内的证据。
     * <p>与三处原实现的过滤循环逐字等价：无失效登记即原样返回；否则按 {@code !invalidated.contains(id)} 保留
     * （id 为空视为未登记失效，予以保留，与原语义一致）。
     */
    private static <T> List<T> retainValid(List<T> all, Set<Long> invalidatedIds, Function<T, Long> idExtractor) {
        if (all == null || all.isEmpty()) {
            return all == null ? List.of() : all;
        }
        if (invalidatedIds == null || invalidatedIds.isEmpty()) {
            return all;
        }
        return all.stream()
                .filter(e -> !invalidatedIds.contains(idExtractor.apply(e)))
                .toList();
    }
}
