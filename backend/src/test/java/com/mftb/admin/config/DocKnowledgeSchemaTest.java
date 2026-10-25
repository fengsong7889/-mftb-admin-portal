package com.mftb.admin.config;

import com.mftb.admin.config.migration.ContractSpec;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.*;

/** P0 结构契约：8 张表、关键列、全文索引声明必须与迁移脚本一致。 */
class DocKnowledgeSchemaTest {
    @Test void contractsCoverP0Tables() {
        var contracts = DocKnowledgeSchema.contracts();
        assertEquals(8, contracts.size());
        Set<String> tables = contracts.stream().map(ContractSpec::table).collect(Collectors.toSet());
        assertEquals(Set.of(
                "doc_category", "doc_tag", "doc_node_tag", "doc_asset",
                "doc_revision_asset", "doc_acl_entry", "doc_user_clearance", "doc_search_index"), tables);
    }

    @Test void searchIndexDeclaresFulltextAndPermissionFacets() {
        ContractSpec search = DocKnowledgeSchema.contracts().stream()
                .filter(contract -> contract.table().equals("doc_search_index"))
                .findFirst().orElseThrow();
        assertTrue(search.createTableIfMissing().contains("WITH PARSER ngram"));
        assertTrue(search.requiredColumns().stream().anyMatch(column -> column.column().equals("body_text")));
        assertTrue(search.requiredColumns().stream().anyMatch(column -> column.column().equals("confidentiality")));
        assertTrue(search.requiredColumns().stream().anyMatch(column -> column.column().equals("index_state")));
    }

    @Test void aclEntryUsesSubjectTypesAndExpiry() {
        ContractSpec acl = DocKnowledgeSchema.contracts().stream()
                .filter(contract -> contract.table().equals("doc_acl_entry"))
                .findFirst().orElseThrow();
        assertTrue(acl.requiredColumns().stream().anyMatch(column -> column.column().equals("subject_type")));
        assertTrue(acl.requiredColumns().stream().anyMatch(column -> column.column().equals("expires_at")));
        assertTrue(acl.createTableIfMissing().contains("subject_type IN ('USER','DEPT','ROLE','ALL')"));
    }
}
