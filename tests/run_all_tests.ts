// Master Test Runner executing all 22 test suites in repository
import './obsidian_mock';

console.log("================================================================================");
console.log("  EXECUTING ALL REPOSITORY TEST SUITES (22 SUITES)                           ");
console.log("================================================================================");

import './bx_mutation_test';
import './combinatorial_test';
import './cross_check_commit_51c6d39';
import './exhaustive_matrix_test';
import './precedence_test';
import './test_abstract_and_datatypes';
import './test_all_functions';
import './test_author_propagation_and_citekey';
import './test_citation_notes';
import './test_complete_propagation_integrity';
import './test_corpus_export_simulation';
import './test_corpus_sources_propagation';
import './test_export_sanitization';
import './test_linting_engine_cross_state_trees';
import './test_mode_toggle';
import './test_overloading';
import './test_procedural_linting_and_accordion_engine';
import './test_propagation';
import './test_stateful_add_entry';
import './test_video_and_recurring_authors';
import './test_universal_compiler_edge_cases';
import './test_citation_groups_and_collections';
