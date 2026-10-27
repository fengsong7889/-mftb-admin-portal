package com.mftb.admin.contracts.oa;

import java.util.Collection;
import java.util.Map;

/**
 * OA 申请单只读投影契约。
 *
 * <p>用途：其它域只需要「某类流程的申请表单原文」时（例如 EAM 采购回填品牌），
 * 通过本端口取数，而不是注入 {@code OaRequestMapper} 直接查 OA 事务表。
 *
 * <p>返回值刻意用 {@code Map<String, String>}（flowNo → formData JSON 原文）：
 * 表单结构属于各流程自己的协议，OA 不替调用方解释字段语义，也不把实体泄露出去。
 */
public interface OaRequestFormPort {

    /**
     * 按流程编码 + 流程号批量取申请表单原文。
     *
     * @param processCode 流程编码（如 {@code oa_purchase}）
     * @param flowNos     流程号集合；空集合直接返回空 Map，不查库
     * @return flowNo → formData（JSON 原文）；查不到或 formData 为空的不出现在结果里
     */
    Map<String, String> findFormDataByFlowNos(String processCode, Collection<String> flowNos);
}
