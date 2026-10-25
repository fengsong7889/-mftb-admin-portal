package com.mftb.admin.service.impl;

import com.mftb.admin.entity.HcmPiiAccessLog;
import com.mftb.admin.entity.Person;
import com.mftb.admin.mapper.HcmPiiAccessLogMapper;
import com.mftb.admin.service.HcmPersonPiiService;
import com.mftb.admin.service.PermissionService;
import com.mftb.admin.util.HcmPiiMasker;
import com.mftb.admin.util.OperatorResolver;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 脱敏决策实现：读权限 → 掩码或明文 → 明文时留痕。
 * <p>
 * 留痕失败不阻断读取：合规上需要"能看到就要留痕"，但把日志故障变成业务 500 会让花名册直接不可用；
 * 这里降级为告警日志（由监控抓取），并在代码里写明这是有意识的取舍。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HcmPersonPiiServiceImpl implements HcmPersonPiiService {

    private static final String MENU_KEY = "hcm-person";
    private static final String ACTION_SENSITIVE = "viewSensitive";

    private final PermissionService permissionService;
    private final OperatorResolver operatorResolver;
    private final HcmPiiAccessLogMapper accessLogMapper;

    @Override
    public void applyMasking(Person person, String scene) {
        if (person == null) {
            return;
        }
        List<String> fields = presentSensitiveFields(person);
        if (fields.isEmpty()) {
            // 本来就没有敏感值，既不需要掩码也不需要留痕
            return;
        }
        if (!canViewSensitive()) {
            person.setMobile(HcmPiiMasker.mobile(person.getMobile()));
            person.setEmail(HcmPiiMasker.email(person.getEmail()));
            person.setBirthDate(null);
            return;
        }
        record(person.getId(), fields, scene);
    }

    private List<String> presentSensitiveFields(Person person) {
        List<String> fields = new ArrayList<>();
        if (person.getMobile() != null && !person.getMobile().isBlank()) {
            fields.add("mobile");
        }
        if (person.getEmail() != null && !person.getEmail().isBlank()) {
            fields.add("email");
        }
        if (person.getBirthDate() != null) {
            fields.add("birthDate");
        }
        return fields;
    }

    private boolean canViewSensitive() {
        return permissionService.hasPermission(operatorResolver.currentUser(), MENU_KEY, ACTION_SENSITIVE);
    }

    private void record(Long personId, List<String> fields, String scene) {
        try {
            HcmPiiAccessLog log = new HcmPiiAccessLog();
            log.setActor(operatorResolver.currentOperatorAccount());
            log.setPersonId(personId);
            log.setFields(String.join(",", fields));
            log.setScene(scene);
            accessLogMapper.insert(log);
        } catch (Exception e) {
            HcmPersonPiiServiceImpl.log.warn("敏感字段查看留痕失败 personId={} scene={}: {}", personId, scene, e.getMessage());
        }
    }
}
