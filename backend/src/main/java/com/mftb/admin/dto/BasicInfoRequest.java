package com.mftb.admin.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 员工基础信息更新请求（个人信息/证件信息/通讯信息 共用）
 */
@Data
public class BasicInfoRequest {

    // ── 个人信息 ──
    private String gender;
    private String nationality;
    private String ethnicity;
    private LocalDate birthDate;
    private String maritalStatus;
    private String politicalStatus;
    private String religion;

    // ── 证件信息 ──
    private String idType;
    private String idNumber;
    private String idAddress;
    private String householdType;
    private String householdLocation;
    private String nativePlace;

    // ── 通讯信息 ──
    private String mobile;
    private String email;
    /** 钉钉用户ID（工作通知定向推送用，如领用签署通知） */
    private String dingtalkUserId;
    private String addressCountry;
    private String addressCity;
    private String addressDetail;
}
