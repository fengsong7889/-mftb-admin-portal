package com.mftb.admin.service;

import com.mftb.admin.entity.EamAsset;

/**
 * 资产持有关系生命周期服务
 * <p>
 * 集中实现异常处置（遗失/报废/送修/归还）对来源领用/借用的关闭、对资产持有关系的显式清空，
 * 以及持有关系状态事件的记录。所有方法为内部写操作，要求加入调用方事务，并在调用方已对资产行
 * 持有 {@code FOR UPDATE} 锁后执行（锁顺序：来源领用/借用 → 资产 → 关联单据，由调用方保证）。
 */
public interface EamAssetLifecycleService {

    /** 终止来源类型 */
    String CLOSE_LOSS = "loss";
    String CLOSE_SCRAP = "scrap";
    String CLOSE_REPAIR = "repair";

    /** 来源领用/借用被异常单据关闭后的状态 */
    String CLAIM_LOSS_CLOSED = "loss_closed";
    String CLAIM_SCRAP_CLOSED = "scrap_closed";
    String CLAIM_REPAIR_CLOSED = "repair_closed";

    /** 来源关闭结果快照 */
    record ClosedSource(String sourceType, Long sourceId, Long holderId, String holderName, String department) {
        public static ClosedSource none() {
            return new ClosedSource(null, null, null, null, null);
        }
    }

    /**
     * 关闭资产当前有效的领用/借用来源，置为对应的异常终止状态并写入终止快照。
     * <p>调用方须先对资产行持有 FOR UPDATE 锁。优先按 {@code activeClaimId} 关闭领用；
     * 领用持有为空时按资产查活跃借用并关闭。存在多条活跃借用或来源与持有人不一致时抛业务异常，
     * 不猜测关闭哪一条。</p>
     *
     * @param asset      已加锁的资产（读取 activeClaimId/currentHolderId）
     * @param closeType  {@link #CLOSE_LOSS}/{@link #CLOSE_SCRAP}/{@link #CLOSE_REPAIR}
     * @param closeBizId 终止来源单据 ID
     * @param reason     终止说明
     * @return 被关闭来源的快照（无有效来源时 {@link ClosedSource#none()}）
     */
    ClosedSource closeActiveSource(EamAsset asset, String closeType, Long closeBizId, String reason);

    /**
     * 解除资产持有关系并置为目标状态：显式清空 {@code current_holder_id}/{@code user_name}/
     * {@code active_claim_id}/{@code usage_date}（MyBatis-Plus NOT_NULL 策略下必须用 UpdateWrapper 置 null）。
     *
     * @param asset            已加锁的资产
     * @param newStatus        目标资产状态
     * @param receiveDepartment 接收归属部门（为空保持原值）
     * @param receiveLocationId 接收存放位置 ID（为空保持原值）
     */
    void releaseAssetToStatus(EamAsset asset, String newStatus, String receiveDepartment, Long receiveLocationId);

    /**
     * 记录一次资产持有关系状态事件。
     *
     * @param asset       变更前资产（读取 before 状态/持有人/部门）
     * @param bizType     loss/scrap/repair/return
     * @param bizId       业务单据 ID
     * @param source      被关闭来源快照
     * @param afterStatus 变更后资产状态
     * @param afterDepartment 变更后归属部门（为空则取变更前）
     * @param bizDate     业务日期
     * @param requestKey  幂等请求键（可空）
     */
    void recordEvent(EamAsset asset, String bizType, Long bizId, ClosedSource source,
                     String afterStatus, String afterDepartment, java.time.LocalDate bizDate, String requestKey);

    /**
     * 幂等：按操作人 + 请求键查已存在的状态事件，命中返回其业务单据 ID，否则 null。
     * 直接登记入口在资产行锁内调用，命中则短路返回旧结果，避免重复建单。
     */
    Long findBizIdByRequestKey(Long operatorId, String requestKey);
}
