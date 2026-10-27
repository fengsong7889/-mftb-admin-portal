package com.mftb.admin.security;

import com.mftb.admin.controller.DocKnowledgeController;
import com.mftb.admin.dto.DocKnowledgeDTO.Asset;
import com.mftb.admin.dto.DocKnowledgeDTO.Page;
import com.mftb.admin.dto.DocKnowledgeDTO.PendingAckPage;
import com.mftb.admin.service.doc.DocAckService;
import com.mftb.admin.service.doc.DocApiSpecService;
import com.mftb.admin.service.doc.DocArchiveService;
import com.mftb.admin.service.doc.DocApiCatalogService;
import com.mftb.admin.service.doc.DocSystemPlanService;
import com.mftb.admin.service.doc.DocAssetService;
import com.mftb.admin.service.doc.DocClearanceService;
import com.mftb.admin.service.doc.DocIntegrationGrantService;
import com.mftb.admin.service.doc.DocKnowledgeService;
import com.mftb.admin.service.doc.DocReadingService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;

import java.io.InputStream;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** P0 知识库接口：匿名拒绝、查看权限可检索、上传必须编辑权限。 */
@WebMvcTest(DocKnowledgeController.class)
class DocKnowledgeSecurityTest extends SecurityTestBase {
    @MockBean private DocKnowledgeService knowledge;
    @MockBean private DocAssetService assets;
    @MockBean private DocClearanceService clearances;
    @MockBean private DocAckService acks;
    @MockBean private DocReadingService readings;
    @MockBean private DocApiSpecService apiSpecs;
    @MockBean private DocArchiveService archives;
    @MockBean private DocSystemPlanService systemPlans;
    @MockBean private DocApiCatalogService apiCatalog;
    @MockBean private DocIntegrationGrantService grants;

    @Test void anonymousCannotSearchKnowledge() throws Exception {
        mockMvc.perform(get("/api/doc/v3/search")).andExpect(status().isUnauthorized());
        verifyNoInteractions(knowledge);
    }

    @Test void viewerCanSearchWithDocumentLibraryView() throws Exception {
        grantPermission(viewerUser, "doc-library", "view");
        when(knowledge.search(isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), eq(1), eq(20)))
                .thenReturn(new Page(List.of(), 0, 1, 20));
        mockMvc.perform(authGet("/api/doc/v3/search", viewerUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.total").value(0));
    }

    @Test void viewerCannotUploadWithoutEditPermission() throws Exception {
        grantPermission(viewerUser, "doc-library", "view");
        // 项目统一异常处理：HTTP 200 + body.code=403；安全边界仍由 code 表达。
        mockMvc.perform(authPost("/api/doc/v3/assets/upload?spaceId=3&fileName=a.pdf", viewerUser)
                        .content(new byte[]{1}).contentType("application/pdf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(assets);
    }

    @Test void clearanceListRequiresSpaceEdit() throws Exception {
        grantPermission(viewerUser, "doc-library", "edit");
        mockMvc.perform(authGet("/api/doc/v3/clearances", viewerUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(clearances);
    }

    @Test void clearanceUserSearchRequiresSpaceEdit() throws Exception {
        grantPermission(viewerUser, "doc-library", "edit");
        mockMvc.perform(authGet("/api/doc/v3/clearances/users", viewerUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(clearances);
    }

    @Test void spaceAdminCanListClearances() throws Exception {
        grantPermission(viewerUser, "doc-space", "edit");
        when(clearances.list(isNull())).thenReturn(List.of());
        mockMvc.perform(authGet("/api/doc/v3/clearances", viewerUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data").isEmpty());
    }

    @Test void viewerCanReadOwnPendingAcks() throws Exception {
        grantPermission(viewerUser, "doc-library", "view");
        when(acks.pending(eq(1), eq(20))).thenReturn(new PendingAckPage(List.of(), 0, 1, 20));
        mockMvc.perform(authGet("/api/doc/v3/me/pending-acks", viewerUser))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.total").value(0));
    }

    @Test void viewerCannotReplaceAckTargets() throws Exception {
        grantPermission(viewerUser, "doc-library", "view");
        mockMvc.perform(authPut("/api/doc/v3/documents/41/ack-targets", viewerUser)
                        .contentType("application/json")
                        .content("{\"targets\":[]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(403));
        verifyNoInteractions(acks);
    }

    @Test void editorReachesRawUploadEndpoint() throws Exception {
        grantPermission(viewerUser, "doc-library", "edit");
        when(assets.upload(eq(3L), eq("a.pdf"), any(), anyLong(), any(InputStream.class)))
                .thenReturn(new Asset(9L, 3L, "a.pdf", "application/pdf", 1, 2, "UNSCANNED", 3L, null));
        mockMvc.perform(authPost("/api/doc/v3/assets/upload?spaceId=3&fileName=a.pdf", viewerUser)
                        .content(new byte[]{1}).contentType("application/pdf"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(9));
    }
}
