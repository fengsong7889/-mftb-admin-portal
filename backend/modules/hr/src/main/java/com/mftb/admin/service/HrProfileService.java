package com.mftb.admin.service;

import com.mftb.admin.entity.HrProfileItem;

import java.util.List;

/**
 * 人员档案扩展（教育/履历/资质/奖惩）。
 * <p>只做档案证据维护，不参与编制、薪资与日期生效；写权归 hcm-person 菜单。
 */
public interface HrProfileService {

    List<HrProfileItem> listByPerson(Long personId, String itemType);

    HrProfileItem getItem(Long id);

    HrProfileItem saveItem(HrProfileItem item);

    void deleteItem(Long id);
}
