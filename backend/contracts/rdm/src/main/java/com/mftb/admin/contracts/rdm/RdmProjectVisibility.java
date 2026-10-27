package com.mftb.admin.contracts.rdm;

/**
 * 产研交付（RDM）对外暴露的最小契约：项目可见性校验。
 *
 * 为什么要有这个接口：AI 动作服务（service/agent/AgentActionService）在推送前需要
 * 重新校验「发起人是否仍能看到该项目」，此前直接依赖 RDM 的实现类 RdmProjectFactService，
 * 导致 legacy 反向依赖 RDM 域模块，域模块与 legacy 形成编译环。
 *
 * 因此把这条跨域调用收敛为「接口在 contracts、实现在 RDM 域、装配由 Spring 完成」：
 * legacy -> contracts/rdm <- modules/rdm，依赖方向单向，RDM 的实体与 Mapper 不外泄。
 *
 * 接口只声明「校验」，不返回 RDM 实体：调用方只需要「无权时抛异常」这一语义，
 * 返回值一旦暴露 RdmProject，契约就会重新绑上领域模型。
 */
public interface RdmProjectVisibility {

    /**
     * 断言用户对项目可见（项目不存在或成员关系已被收回时抛出异常，由调用方决定降级方式）。
     *
     * @param projectId 项目 ID
     * @param userId    发起人用户 ID
     */
    void assertProjectVisible(Long projectId, Long userId);
}
