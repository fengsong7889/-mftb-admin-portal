package com.mftb.admin.service;

import com.mftb.admin.entity.Person;

/**
 * 人员敏感字段的「按权脱敏 / 明文留痕」。
 * <p>
 * 为什么单独一个服务：脱敏判断散在 Controller 里既测不到也不可复用（导出、异步作业都要同一口径）。
 * 这里的约定是：没有 {@code hcm-person:viewSensitive} 就返回掩码；有则返回明文并写一条查看留痕。
 */
public interface HcmPersonPiiService {

    /**
     * 按当前登录人权限处理一条人员数据（就地修改）。
     *
     * @param person 人员实体
     * @param scene  场景：detail / list / export
     */
    void applyMasking(Person person, String scene);
}
