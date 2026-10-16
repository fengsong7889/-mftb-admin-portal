package com.mftb.admin.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.mftb.admin.constant.RdmConstants;
import com.mftb.admin.entity.RdmAcceptanceRecord;
import com.mftb.admin.entity.RdmDeliveryItem;
import com.mftb.admin.entity.RdmEvidenceInvalidation;
import com.mftb.admin.entity.RdmTestBatch;
import com.mftb.admin.entity.RdmTestExecution;
import com.mftb.admin.entity.RdmTestRound;
import com.mftb.admin.mapper.RdmAcceptanceRecordMapper;
import com.mftb.admin.mapper.RdmDeliveryItemMapper;
import com.mftb.admin.mapper.RdmEvidenceInvalidationMapper;
import com.mftb.admin.mapper.RdmIssueMapper;
import com.mftb.admin.mapper.RdmProjectMapper;
import com.mftb.admin.mapper.RdmRequirementMapper;
import com.mftb.admin.mapper.RdmTestBatchMapper;
import com.mftb.admin.mapper.RdmTestExecutionMapper;
import com.mftb.admin.mapper.RdmTestRoundMapper;
import com.mftb.admin.mapper.RdmWorkTaskMapper;
import com.mftb.admin.mapper.SysUserMapper;
import com.mftb.admin.util.BizSeqService;
import com.mftb.admin.util.JsonUtils;
import com.mftb.admin.util.OperatorResolver;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 任务33：共享 {@link EvidenceValidityResolver} 的读取口径，以及三处消费点
 * （测试放行闸门 / 验收放行闸门 / 交付项状态推导）的<b>差分一致性</b>测试。
 *
 * <p><b>为什么必须做差分测试</b>：失效过滤语义原先在三个 Service 各自复刻，抽取成共享解析器后，
 * 若解析器与某个消费点口径漂移（漏按 deliveryItemId 过滤、漏按 evidenceType 过滤、
 * null evidenceId 处理不一致等），各 Service 的单测可能各自全绿而整体错误，
 * 后果是「按旧范围验过的证据继续被当作当前范围的质量凭证」—— 属安全边界失效，不能用人工核对替代。
 *
 * <p><b>测试构造</b>：
 * <ol>
 *   <li>三个 Service 注入<b>同一个</b> {@code EvidenceValidityResolver} 实例（等价 Spring 单例语义），
 *       解析器与 {@link RdmDeliveryItemService} 共用同一个 mock {@link RdmEvidenceInvalidationMapper}；</li>
 *   <li>mock Mapper 以「失效登记表 + Wrapper 条件参数」在测试内<b>复现数据库等值查询</b>
 *       （见 {@link #fakeRows}），因此解析器传给 DB 的 deliveryItemId / evidenceType 是否真被消费也在断言范围内；</li>
 *   <li>期望值来自测试<b>独立手算的 oracle</b>（{@link #oracleInvalidated}），不复用解析器代码；
 *       再断言解析器与三处消费点的判定逐点相等 —— 任一处漂移即失败。</li>
 * </ol>
 *
 * <p>夹具事实：交付项 {@code ITEM} 有一条「冻结轮次必测用例全 pass」的提测批次，
 * 以及一条当前 scopeVersion 下产品验收 pass 记录，验收路径 B ⇒ 状态推导应为 done。
 */
class RdmEvidenceValidityResolverTest {

    private static final long ITEM = 500L;
    private static final long OTHER_ITEM = 600L;
    private static final long BATCH = 900L;
    private static final long ROUND = 700L;
    private static final long ACCEPT_ID = 3300L;
    private static final int SCOPE = 3;
    private static final long LEAD = 11L;

    /** 失效登记表内容（模拟 rdm_evidence_invalidation） */
    private List<RdmEvidenceInvalidation> table;

    static {
        // 纯单测环境未启动 Spring/MyBatis-Plus：手工注册 TableInfo，
        // 使 LambdaQueryWrapper 能物化 SQL 条件（本测试需从条件里取参数值以模拟数据库过滤）。
        // 注：后续 @SpringBootTest 用不同 Configuration 会自行重建 TableInfo，不互干扰。
        MybatisConfiguration configuration = new MybatisConfiguration();
        GlobalConfigUtils.setGlobalConfig(configuration, GlobalConfigUtils.defaults());
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(configuration, ""), RdmEvidenceInvalidation.class);
    }

    private RdmEvidenceInvalidationMapper invalidationMapper;
    private EvidenceValidityResolver resolver;

    /* 三个消费点及其各自的「全量证据加载」桩 */
    private RdmTestBatchMapper testBatchMapper;
    private RdmAcceptanceRecordMapper acceptanceRecordMapper;
    private RdmDeliveryItemMapper deliveryItemMapper;

    private RdmTestBatchService testBatchService;
    private RdmAcceptanceRecordService acceptanceRecordService;
    private RdmDeliveryItemService deliveryItemService;

    @BeforeEach
    void setUp() {
        table = new ArrayList<>();
        invalidationMapper = mock(RdmEvidenceInvalidationMapper.class);
        // 「数据库」：按 Wrapper 等值条件真实过滤登记表，从而校验解析器的传参消费口径
        when(invalidationMapper.selectList(any())).thenAnswer(inv -> fakeRows(inv.getArgument(0)));
        when(invalidationMapper.selectCount(any())).thenAnswer(inv -> (long) fakeRows(inv.getArgument(0)).size());
        resolver = new EvidenceValidityResolver(invalidationMapper);

        testBatchMapper = mock(RdmTestBatchMapper.class);
        RdmTestExecutionMapper executionMapper = mock(RdmTestExecutionMapper.class);
        RdmTestRoundMapper testRoundMapper = mock(RdmTestRoundMapper.class);
        acceptanceRecordMapper = mock(RdmAcceptanceRecordMapper.class);
        deliveryItemMapper = mock(RdmDeliveryItemMapper.class);
        RdmWorkTaskMapper taskMapper = mock(RdmWorkTaskMapper.class);
        RdmRequirementMapper requirementMapper = mock(RdmRequirementMapper.class);
        RdmIssueMapper issueMapper = mock(RdmIssueMapper.class);
        RdmProjectMapper projectMapper = mock(RdmProjectMapper.class);
        SysUserMapper userMapper = mock(SysUserMapper.class);
        RdmAccessGuard accessGuard = mock(RdmAccessGuard.class);
        RdmFlowVersionGuard flowVersionGuard = mock(RdmFlowVersionGuard.class);
        BizSeqService bizSeqService = mock(BizSeqService.class);
        OperatorResolver operatorResolver = mock(OperatorResolver.class);
        RdmIdempotentService idempotentService = mock(RdmIdempotentService.class);
        RdmOpenFactService openFactService = mock(RdmOpenFactService.class);
        RdmTestBatchService testBatchServiceForAcceptance = mock(RdmTestBatchService.class);

        // 证据全量加载：一条通过批次 + 一条 pass 产品验收记录；无研发任务
        when(testBatchMapper.selectList(any()))
                .thenReturn(new ArrayList<>(List.of(passedBatch(BATCH, ITEM, RdmConstants.TB_PASSED))));
        when(acceptanceRecordMapper.selectList(any()))
                .thenReturn(new ArrayList<>(List.of(productPassRecord(ACCEPT_ID, ITEM, SCOPE))));
        when(taskMapper.selectCount(any())).thenReturn(0L);
        when(taskMapper.selectList(any())).thenReturn(List.of());
        when(issueMapper.selectCount(any())).thenReturn(0L);
        when(executionMapper.selectCount(any())).thenReturn(0L);
        when(testRoundMapper.selectCount(any())).thenReturn(0L);
        // 冻结轮次：唯一必测用例 CASE-A，执行结果 pass ⇒ 测试门禁成立
        when(testRoundMapper.selectOne(any())).thenReturn(frozenRound());
        when(executionMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(passExecution())));

        testBatchService = new RdmTestBatchService(testBatchMapper, executionMapper, deliveryItemMapper,
                requirementMapper, issueMapper, accessGuard, bizSeqService, operatorResolver, testRoundMapper,
                resolver, idempotentService);
        acceptanceRecordService = new RdmAcceptanceRecordService(acceptanceRecordMapper, deliveryItemMapper,
                requirementMapper, bizSeqService, accessGuard, testBatchServiceForAcceptance, resolver,
                idempotentService, openFactService);
        deliveryItemService = new RdmDeliveryItemService(deliveryItemMapper, requirementMapper, taskMapper,
                testBatchMapper, mock(RdmTestExecutionMapper.class), acceptanceRecordMapper, issueMapper,
                projectMapper, userMapper, bizSeqService, accessGuard, invalidationMapper, resolver,
                flowVersionGuard, idempotentService);
    }

    /* ==================== 夹具 ==================== */

    /**
     * 复现数据库等值查询：从条件构造器的参数映射取 deliveryItemId(Long) 与可选的 evidenceType(String)，
     * 据此过滤登记表。
     * <p>{@code hasAnyInvalidation} 只带 deliveryItemId 条件（与原三处实现一致），此时不过滤类型。
     */
    private List<RdmEvidenceInvalidation> fakeRows(Wrapper<RdmEvidenceInvalidation> wrapper) {
        assertNotNull(wrapper, "失效登记查询必须携带条件构造器");
        AbstractWrapper<?, ?, ?> condition = (AbstractWrapper<?, ?, ?>) wrapper;
        // MyBatis-Plus 在拼 SQL 时才把条件值写入参数映射，必须先物化再读取
        condition.getSqlSegment();
        Collection<Object> values = condition.getParamNameValuePairs().values();
        assertFalse(values.isEmpty(), "失效登记查询必须携带 deliveryItemId 等值条件");
        Long itemId = values.stream().filter(Long.class::isInstance).map(Long.class::cast).findFirst().orElse(null);
        String evidenceType = values.stream().filter(String.class::isInstance).map(String.class::cast)
                .findFirst().orElse(null);
        return table.stream()
                .filter(r -> Objects.equals(itemId, r.getDeliveryItemId()))
                .filter(r -> evidenceType == null || evidenceType.equals(r.getEvidenceType()))
                .toList();
    }

    private RdmEvidenceInvalidation inv(long deliveryItemId, String evidenceType, Long evidenceId) {
        RdmEvidenceInvalidation r = new RdmEvidenceInvalidation();
        r.setDeliveryItemId(deliveryItemId);
        r.setEvidenceType(evidenceType);
        r.setEvidenceId(evidenceId);
        r.setOldScopeVersion(SCOPE);
        r.setNewScopeVersion(SCOPE + 1);
        r.setInvalidatedAt(LocalDateTime.now());
        return r;
    }

    private RdmTestBatch passedBatch(long id, long itemId, String status) {
        RdmTestBatch b = new RdmTestBatch();
        b.setId(id);
        b.setBatchNo("TC" + id);
        b.setRoundNo(1);
        b.setStatus(status);
        b.setDeliveryItemIdsJson(JsonUtils.toJson(List.of(itemId)));
        b.setTestEnv("SIT");
        b.setTestLeadUserId(LEAD);
        return b;
    }

    private RdmTestRound frozenRound() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("deliveryItemId", ITEM);
        c.put("caseId", "CASE-A");
        c.put("caseTitle", "登錄成功");
        c.put("mandatory", true);
        c.put("scopeVersion", SCOPE);
        RdmTestRound r = new RdmTestRound();
        r.setId(ROUND);
        r.setBatchId(BATCH);
        r.setRoundNo(1);
        r.setTestEnv("SIT");
        r.setCaseSnapshotJson(JsonUtils.toJson(List.of(c)));
        r.setBuildMappingJson(JsonUtils.toJson(List.of()));
        return r;
    }

    private RdmTestExecution passExecution() {
        RdmTestExecution e = new RdmTestExecution();
        e.setId(1L);
        e.setBatchId(BATCH);
        e.setDeliveryItemId(ITEM);
        e.setCaseId("CASE-A");
        e.setResult("pass");
        e.setRoundNo(1);
        return e;
    }

    private RdmAcceptanceRecord productPassRecord(long id, long itemId, Integer scopeVersion) {
        RdmAcceptanceRecord r = new RdmAcceptanceRecord();
        r.setId(id);
        r.setRecordNo("AR" + id);
        r.setDeliveryItemId(itemId);
        r.setAcceptanceType(RdmConstants.ACCEPTANCE_TYPE_PRODUCT);
        r.setStage(RdmConstants.ACCEPT_STAGE_PRE);
        r.setConclusion(RdmConstants.ACCEPT_PASS);
        r.setScopeVersion(scopeVersion);
        r.setSignerUserId(21L);
        r.setCreatedAt(LocalDateTime.now());
        return r;
    }

    private RdmDeliveryItem doneItem() {
        RdmDeliveryItem it = new RdmDeliveryItem();
        it.setId(ITEM);
        it.setReqId(100L);
        it.setStatus(RdmConstants.DI_DONE);
        it.setVersion(9);
        it.setScopeVersion(SCOPE);
        it.setBlockedFlag(0);
        it.setAcceptancePath(RdmConstants.PATH_B);
        it.setTitle("item");
        return it;
    }

    /* ==================== 独立 oracle（不复用解析器代码） ==================== */

    /** 手算「该交付项 + 该证据类型下已失效的证据 id 集合」，与解析器实现无关。 */
    private Set<Long> oracleInvalidated(long itemId, String evidenceType) {
        return table.stream()
                .filter(r -> Long.valueOf(itemId).equals(r.getDeliveryItemId()))
                .filter(r -> evidenceType.equals(r.getEvidenceType()))
                .map(RdmEvidenceInvalidation::getEvidenceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
    }

    /** 手算「该交付项是否存在任意失效登记」（状态回退闸门口径，不带类型条件）。 */
    private boolean oracleHasAnyInvalidation(long itemId) {
        return table.stream().anyMatch(r -> Long.valueOf(itemId).equals(r.getDeliveryItemId()));
    }

    /**
     * 差分断言核心：对同一份失效登记表，解析器、测试门禁、验收门禁、交付项状态推导四者
     * 必须给出一致的「证据是否仍然有效」结论。
     *
     * @param expectBatchValid  oracle 判定：提测批次是否仍是有效凭证
     * @param expectAcceptValid oracle 判定：产品验收记录是否仍是有效凭证
     * @param expectItemStatus  按 oracle 过滤后交付项应处于的状态
     */
    private void assertFourWayConsistency(boolean expectBatchValid, boolean expectAcceptValid, String expectItemStatus) {
        // 1) 解析器读取口径必须与 oracle 相等（防「漏按类型/交付项过滤」的漂移）
        assertEquals(oracleInvalidated(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH),
                resolver.invalidatedEvidenceIds(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH),
                "解析器对提测批次失效集合的读取与 oracle 不一致");
        assertEquals(oracleInvalidated(ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE),
                resolver.invalidatedEvidenceIds(ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE),
                "解析器对验收记录失效集合的读取与 oracle 不一致");
        assertEquals(oracleHasAnyInvalidation(ITEM), resolver.hasAnyInvalidation(ITEM),
                "解析器「是否存在失效登记」的读取与 oracle 不一致");

        // 2) 消费点一：测试放行闸门
        assertEquals(expectBatchValid, testBatchService.isTestPassed(ITEM),
                "测试门禁与共享解析器判定不一致（失效过滤语义漂移）");

        // 3) 消费点二：验收放行闸门
        assertEquals(expectAcceptValid, acceptanceRecordService.hasProductAcceptancePassed(ITEM, SCOPE),
                "验收门禁与共享解析器判定不一致（失效过滤语义漂移）");

        // 4) 消费点三：交付项状态推导（同一解析器实例，必须与前两者同进同退）
        RdmDeliveryItem it = doneItem();
        when(deliveryItemMapper.selectById(ITEM)).thenReturn(it);
        when(deliveryItemMapper.updateById(any(RdmDeliveryItem.class))).thenReturn(1);
        deliveryItemService.recalculateStatus(ITEM);
        assertEquals(expectItemStatus, it.getStatus(),
                "交付项状态推导与共享解析器判定不一致（失效过滤语义漂移）");

        // 5) 跨消费点公理：done（路径 B）由有效验收凭证支撑；验收凭证失效则三处不得再有任何一处放行 done
        boolean rolledBack = !RdmConstants.DI_DONE.equals(it.getStatus());
        if (expectAcceptValid) {
            assertFalse(rolledBack, "验收证据仍有效却发生状态回退（失效判定被过度扩大）");
        } else {
            assertTrue(rolledBack && oracleHasAnyInvalidation(ITEM),
                    "验收证据已失效但 done 未回退 —— 旧范围证据被当作当前范围凭证");
        }
    }

    /* ==================== 解析器读取口径 ==================== */

    @Test
    @DisplayName("交付项为空：返回空集且不查库")
    void nullItemShortCircuits() {
        assertTrue(resolver.invalidatedEvidenceIds(null, RdmEvidenceInvalidation.TYPE_TEST_BATCH).isEmpty());
        assertFalse(resolver.hasAnyInvalidation(null));
        verify(invalidationMapper, never()).selectList(any());
        verify(invalidationMapper, never()).selectCount(any());
    }

    @Test
    @DisplayName("剔除 null evidenceId 并去重（与三处原实现一致）")
    void nullsDroppedAndDeduped() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, null));
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        assertEquals(Set.of(BATCH), resolver.invalidatedEvidenceIds(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH));
    }

    @Test
    @DisplayName("按证据类型隔离：release_check 失效不影响测试批次/验收判定")
    void typeIsolated() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_RELEASE_CHECK, BATCH));
        assertTrue(resolver.invalidatedEvidenceIds(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH).isEmpty());
        assertTrue(resolver.invalidatedEvidenceIds(ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE).isEmpty());
    }

    @Test
    @DisplayName("按交付项隔离：其它交付项的失效不影响本项")
    void itemIsolated() {
        table.add(inv(OTHER_ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        table.add(inv(OTHER_ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE, ACCEPT_ID));
        assertTrue(resolver.invalidatedEvidenceIds(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH).isEmpty());
        assertFalse(resolver.hasAnyInvalidation(ITEM));
    }

    @Test
    @DisplayName("过滤保持入参顺序（交付项验收状态取首条依赖 createdAt 倒序）")
    void filterPreservesOrder() {
        RdmAcceptanceRecord newer = productPassRecord(2L, ITEM, SCOPE);
        RdmAcceptanceRecord older = productPassRecord(1L, ITEM, SCOPE);
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE, 1L));
        List<RdmAcceptanceRecord> valid = resolver.validAcceptanceRecords(ITEM, new ArrayList<>(List.of(newer, older)));
        assertEquals(List.of(newer), valid, "失效记录被剔除后必须保留原有倒序");
    }

    @Test
    @DisplayName("null / 空集合入参：null 返回空集，空集原样返回，无失效登记原样返回")
    void nullAndEmptyInputs() {
        RdmTestBatch b = passedBatch(BATCH, ITEM, RdmConstants.TB_PASSED);
        assertTrue(resolver.validTestBatches(ITEM, null).isEmpty());
        assertTrue(resolver.validTestBatches(ITEM, List.of()).isEmpty());
        assertEquals(List.of(b), resolver.validTestBatches(ITEM, new ArrayList<>(List.of(b))));
        // itemId 为空时不得凭空丢弃证据（等价原实现：失效集合为空 → 原样返回）
        assertEquals(1, resolver.validTestBatches(null, new ArrayList<>(List.of(b))).size());
    }

    @Test
    @DisplayName("id 为空的证据视为未登记失效予以保留（原语义）")
    void evidenceWithNullIdRetained() {
        RdmTestBatch noId = new RdmTestBatch();
        noId.setStatus(RdmConstants.TB_PASSED);
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        assertEquals(1, resolver.validTestBatches(ITEM, new ArrayList<>(List.of(noId))).size(),
                "id 为空不应被误判为已失效");
    }

    /* ==================== 三处消费点差分一致性 ==================== */

    @Test
    @DisplayName("无失效登记：三处一致认定证据有效，done 不回退")
    void noInvalidation() {
        assertFourWayConsistency(true, true, RdmConstants.DI_DONE);
    }

    @Test
    @DisplayName("仅测试批次失效：测试门禁不再放行，验收仍有效，done 不动")
    void onlyTestBatchInvalidated() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        assertFourWayConsistency(false, true, RdmConstants.DI_DONE);
    }

    @Test
    @DisplayName("仅验收记录失效：验收门禁不再放行，交付项回退到待验收（测试凭证仍有效）")
    void onlyAcceptanceInvalidated() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE, ACCEPT_ID));
        assertFourWayConsistency(true, false, RdmConstants.DI_PENDING_ACCEPTANCE);
    }

    @Test
    @DisplayName("两类证据同时失效：三处一致认定无有效凭证，done 回退到准备中")
    void bothInvalidated() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE, ACCEPT_ID));
        assertFourWayConsistency(false, false, RdmConstants.DI_PREPARING);
    }

    @Test
    @DisplayName("失效登记属于其它交付项：三处一致不受影响")
    void invalidationBelongsToOtherItem() {
        table.add(inv(OTHER_ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));
        table.add(inv(OTHER_ITEM, RdmEvidenceInvalidation.TYPE_ACCEPTANCE, ACCEPT_ID));
        assertFourWayConsistency(true, true, RdmConstants.DI_DONE);
    }

    @Test
    @DisplayName("失效登记属于发布检查类型：不得波及测试/验收判定")
    void invalidationOfOtherEvidenceType() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_RELEASE_CHECK, BATCH));
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_RELEASE_CHECK, ACCEPT_ID));
        assertFourWayConsistency(true, true, RdmConstants.DI_DONE);
    }

    @Test
    @DisplayName("失效登记 evidenceId 为空：不剔除任何证据，三处仍判定有效")
    void invalidationWithNullEvidenceId() {
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, null));
        assertFourWayConsistency(true, true, RdmConstants.DI_DONE);
    }

    @Test
    @DisplayName("多批次部分失效：仍剩一条有效通过批次即放行，且解析器确实剔除了失效批次")
    void partiallyInvalidatedBatchesStillPass() {
        RdmTestBatch invalidated = passedBatch(BATCH, ITEM, RdmConstants.TB_PASSED);
        RdmTestBatch survivor = passedBatch(BATCH + 1, ITEM, RdmConstants.TB_PASSED);
        when(testBatchMapper.selectList(any())).thenReturn(new ArrayList<>(List.of(invalidated, survivor)));
        table.add(inv(ITEM, RdmEvidenceInvalidation.TYPE_TEST_BATCH, BATCH));

        assertFourWayConsistency(true, true, RdmConstants.DI_DONE);

        List<RdmTestBatch> valid = resolver.validTestBatches(ITEM, List.of(invalidated, survivor));
        assertEquals(1, valid.size(), "失效批次必须被剔除（不是查不到）");
        assertEquals(BATCH + 1, valid.get(0).getId());
    }
}
