package com.mftb.admin.contracts.eam;

import java.util.Optional;

/**
 * 资产回收契约：HR 离职办理在「需交接资产」这一步调用，由 EAM 域兑现。
 *
 * 为什么要有这个接口：HR 离职任务服务原先直接注入 EAM 的 assetMapper 与交接服务，
 * 导致 legacy（HR）反向依赖 EAM 实现。契约放在 contracts/eam，实现留在 modules/eam：
 * legacy -> contracts/eam <- modules/eam。
 *
 * 为什么合成一个方法而不是「先查数量再发起」：原实现的 SKIPPED / DONE 判定依赖同一次查询，
 * 拆成两次调用会引入 TOCTOU（期间资产被领用/归还），状态消息就会与事实不一致。
 *
 * 接口不暴露 EamAsset / 交接单实体：调用方只需要「几项资产」「业务单号」，
 * 一旦返回实体，契约会重新绑上 EAM 的领域模型。
 */
public interface EamAssetReclaimPort {

    /**
     * 为离职员工发起在用资产交接。
     *
     * @param employeeUserId 离职员工 SysUser.id
     * @param command        交接要素（人员、日期、原因、操作人）
     * @return 无在用资产时返回 {@code Optional.empty()}（调用方据此记 SKIPPED）；否则返回交接结果
     */
    Optional<HandoverResult> handoverInUseAssets(Long employeeUserId, ResignationHandoverCommand command);

    /** 交接结果：资产项数 + 可展示的业务单号 */
    record HandoverResult(int assetCount, String handoverNo) {
    }

    /** 离职交接要素：字段与历史 handover 入参同构，避免调用方语义漂移 */
    record ResignationHandoverCommand(
            String fromUserName,
            String fromDepartment,
            String toUserName,
            String toDepartment,
            String receiverType,
            String handoverDate,
            String reason,
            String operatorName,
            String remark) {
    }
}
