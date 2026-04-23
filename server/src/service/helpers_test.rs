use anyhow::anyhow;

use crate::repo::RepoError;

use crate::proto::ameliso_v1 as pb;

use super::*;

#[test]
fn invalid_helper_returns_invalid_argument_status() {
    let s = invalid("repo_id is required");
    assert_eq!(s.code(), tonic::Code::InvalidArgument);
    assert_eq!(s.message(), "repo_id is required");
}

#[test]
fn repo_err_not_found_maps_to_not_found_status() {
    let s = repo_err(RepoError::NotFound("case x".to_owned()));
    assert_eq!(s.code(), tonic::Code::NotFound);
    assert!(s.message().contains("case x"));
}

#[test]
fn repo_err_already_exists_maps_to_already_exists_status() {
    let s = repo_err(RepoError::AlreadyExists("run y".to_owned()));
    assert_eq!(s.code(), tonic::Code::AlreadyExists);
}

#[test]
fn repo_err_closed_run_maps_to_failed_precondition() {
    let s = repo_err(RepoError::ClosedRun("run z".to_owned()));
    assert_eq!(s.code(), tonic::Code::FailedPrecondition);
}

#[test]
fn repo_err_invalid_arg_maps_to_invalid_argument() {
    let s = repo_err(RepoError::InvalidArg("bad path".to_owned()));
    assert_eq!(s.code(), tonic::Code::InvalidArgument);
}

#[test]
fn repo_err_other_maps_to_internal() {
    let s = repo_err(RepoError::Other(anyhow!("oops")));
    assert_eq!(s.code(), tonic::Code::Internal);
    assert!(s.message().contains("oops"));
}

#[test]
fn run_status_to_i32_known_values() {
    assert_eq!(
        run_status_to_i32("in-progress"),
        pb::RunStatus::InProgress as i32
    );
    assert_eq!(
        run_status_to_i32("completed"),
        pb::RunStatus::Completed as i32
    );
    assert_eq!(run_status_to_i32("aborted"), pb::RunStatus::Aborted as i32);
}

#[test]
fn run_status_to_i32_unknown_maps_to_unspecified() {
    assert_eq!(
        run_status_to_i32("bogus"),
        pb::RunStatus::Unspecified as i32
    );
    assert_eq!(run_status_to_i32(""), pb::RunStatus::Unspecified as i32);
}

#[test]
fn result_status_to_i32_known_values() {
    assert_eq!(
        result_status_to_i32("passed"),
        pb::ResultStatus::Passed as i32
    );
    assert_eq!(
        result_status_to_i32("failed"),
        pb::ResultStatus::Failed as i32
    );
    assert_eq!(
        result_status_to_i32("blocked"),
        pb::ResultStatus::Blocked as i32
    );
    assert_eq!(
        result_status_to_i32("skipped"),
        pb::ResultStatus::Skipped as i32
    );
    assert_eq!(
        result_status_to_i32("never"),
        pb::ResultStatus::Never as i32
    );
}

#[test]
fn result_status_to_i32_unknown_maps_to_unspecified() {
    assert_eq!(
        result_status_to_i32("bogus"),
        pb::ResultStatus::Unspecified as i32
    );
}

#[test]
fn result_status_from_i32_round_trips() {
    assert_eq!(
        result_status_from_i32(pb::ResultStatus::Passed as i32),
        "passed"
    );
    assert_eq!(
        result_status_from_i32(pb::ResultStatus::Failed as i32),
        "failed"
    );
    assert_eq!(
        result_status_from_i32(pb::ResultStatus::Blocked as i32),
        "blocked"
    );
    assert_eq!(
        result_status_from_i32(pb::ResultStatus::Skipped as i32),
        "skipped"
    );
    assert_eq!(
        result_status_from_i32(pb::ResultStatus::Never as i32),
        "never"
    );
    assert_eq!(
        result_status_from_i32(pb::ResultStatus::Unspecified as i32),
        "unspecified"
    );
}

#[test]
fn result_status_from_i32_unknown_value_maps_to_unspecified() {
    assert_eq!(result_status_from_i32(9999), "unspecified");
}

#[test]
fn run_status_from_i32_round_trips() {
    assert_eq!(
        run_status_from_i32(pb::RunStatus::InProgress as i32),
        "in-progress"
    );
    assert_eq!(
        run_status_from_i32(pb::RunStatus::Completed as i32),
        "completed"
    );
    assert_eq!(
        run_status_from_i32(pb::RunStatus::Aborted as i32),
        "aborted"
    );
    assert_eq!(
        run_status_from_i32(pb::RunStatus::Unspecified as i32),
        "unspecified"
    );
}

#[test]
fn run_status_from_i32_unknown_value_maps_to_unspecified() {
    assert_eq!(run_status_from_i32(9999), "unspecified");
}

#[test]
fn priority_from_i32_known_values() {
    assert_eq!(priority_from_i32(pb::Priority::Low as i32), Some("low"));
    assert_eq!(
        priority_from_i32(pb::Priority::Medium as i32),
        Some("medium")
    );
    assert_eq!(priority_from_i32(pb::Priority::High as i32), Some("high"));
    assert_eq!(priority_from_i32(pb::Priority::Unspecified as i32), None);
}

#[test]
fn priority_from_i32_unknown_maps_to_none() {
    assert_eq!(priority_from_i32(9999), None);
}

#[test]
fn priority_rank_ordering() {
    assert!(priority_rank("high") < priority_rank("medium"));
    assert!(priority_rank("medium") < priority_rank("low"));
    assert!(priority_rank("low") < priority_rank("unknown"));
}

#[test]
fn priority_rank_known_values() {
    assert_eq!(priority_rank("high"), 0);
    assert_eq!(priority_rank("medium"), 1);
    assert_eq!(priority_rank("low"), 2);
    assert_eq!(priority_rank("bogus"), 3);
}

#[test]
fn result_status_rank_ordering() {
    assert!(result_status_rank("failed") < result_status_rank("never"));
    assert!(result_status_rank("never") < result_status_rank("blocked"));
    assert!(result_status_rank("blocked") < result_status_rank("skipped"));
    assert!(result_status_rank("skipped") < result_status_rank("passed"));
    assert!(result_status_rank("passed") < result_status_rank("unknown"));
}

#[test]
fn result_status_rank_known_values() {
    assert_eq!(result_status_rank("failed"), 0);
    assert_eq!(result_status_rank("never"), 1);
    assert_eq!(result_status_rank("blocked"), 2);
    assert_eq!(result_status_rank("skipped"), 3);
    assert_eq!(result_status_rank("passed"), 4);
    assert_eq!(result_status_rank("bogus"), 5);
}

#[test]
fn case_to_pb_maps_all_fields() {
    let c = repo::LoadedCase {
        case_path: "auth/login".to_owned(),
        title: "Login".to_owned(),
        description: "desc".to_owned(),
        tags: vec!["smoke".to_owned()],
        priority: "high".to_owned(),
        body: "## Steps".to_owned(),
        created_at: "2026-01-01".to_owned(),
        updated_at: "2026-01-02".to_owned(),
    };
    let pb = case_to_pb(&c);
    assert_eq!(pb.path, "auth/login");
    assert_eq!(pb.title, "Login");
    assert_eq!(pb.description, "desc");
    assert_eq!(pb.tags, vec!["smoke"]);
    assert_eq!(pb.priority, "high");
    assert_eq!(pb.created_at, "2026-01-01");
    assert_eq!(pb.updated_at, "2026-01-02");
}

#[test]
fn run_meta_to_pb_maps_all_fields() {
    let r = repo::RunRow {
        run_id: "2026-01-01-smoke".to_owned(),
        date: "2026-01-01".to_owned(),
        tester: "alice".to_owned(),
        status: "in-progress".to_owned(),
        environment: Some("staging".to_owned()),
        suite: Some("smoke".to_owned()),
        commit_sha: "abc123".to_owned(),
    };
    let pb = run_meta_to_pb(&r);
    assert_eq!(pb.id, "2026-01-01-smoke");
    assert_eq!(pb.tester, "alice");
    assert_eq!(pb.status, pb::RunStatus::InProgress as i32);
    assert_eq!(pb.environment, "staging");
    assert_eq!(pb.suite, "smoke");
    assert_eq!(pb.commit_sha, "abc123");
}

#[test]
fn run_meta_to_pb_none_fields_default_to_empty_string() {
    let r = repo::RunRow {
        run_id: "r1".to_owned(),
        date: "2026-01-01".to_owned(),
        tester: "bob".to_owned(),
        status: "completed".to_owned(),
        environment: None,
        suite: None,
        commit_sha: String::new(),
    };
    let pb = run_meta_to_pb(&r);
    assert_eq!(pb.environment, "");
    assert_eq!(pb.suite, "");
    assert_eq!(pb.commit_sha, "");
    // run_meta_to_pb always zeroes counts; callers that have counts use
    // run_meta_with_counts_to_pb directly.
    assert_eq!(pb.passed, 0);
    assert_eq!(pb.failed, 0);
    assert_eq!(pb.blocked, 0);
    assert_eq!(pb.skipped, 0);
    assert_eq!(pb.total, 0);
}

#[test]
fn run_meta_with_counts_to_pb_maps_counts() {
    let r = repo::RunRow {
        run_id: "r1".to_owned(),
        date: "2026-01-01".to_owned(),
        tester: "alice".to_owned(),
        status: "completed".to_owned(),
        environment: None,
        suite: None,
        commit_sha: String::new(),
    };
    let pb = run_meta_with_counts_to_pb(&r, 3, 1, 0, 2, 6);
    assert_eq!(pb.passed, 3);
    assert_eq!(pb.failed, 1);
    assert_eq!(pb.blocked, 0);
    assert_eq!(pb.skipped, 2);
    assert_eq!(pb.total, 6);
}

#[test]
fn result_to_pb_maps_all_fields() {
    let r = repo::LoadedResult {
        case_path: "auth/login".to_owned(),
        status: "passed".to_owned(),
        notes: "all good".to_owned(),
    };
    let pb = result_to_pb(&r);
    assert_eq!(pb.case_path, "auth/login");
    assert_eq!(pb.status, pb::ResultStatus::Passed as i32);
    assert_eq!(pb.notes, "all good");
}

#[test]
fn suite_to_pb_maps_all_fields() {
    let s = repo::SuiteRow {
        slug: "core".to_owned(),
        name: "Core Suite".to_owned(),
        description: Some("desc".to_owned()),
        cases: vec!["auth/login".to_owned()],
    };
    let pb = suite_to_pb(&s);
    assert_eq!(pb.slug, "core");
    assert_eq!(pb.name, "Core Suite");
    assert_eq!(pb.description, "desc");
    assert_eq!(pb.cases, vec!["auth/login"]);
}

#[test]
fn suite_to_pb_none_description_defaults_to_empty_string() {
    let s = repo::SuiteRow {
        slug: "s".to_owned(),
        name: "S".to_owned(),
        description: None,
        cases: vec![],
    };
    let pb = suite_to_pb(&s);
    assert_eq!(pb.description, "");
}

#[test]
fn stored_to_pb_maps_all_fields() {
    let r = crate::repos_store::StoredRepo {
        id: "owner/repo".to_owned(),
        name: "repo".to_owned(),
        full_name: "owner/repo".to_owned(),
        html_url: "https://github.com/owner/repo".to_owned(),
        installation_id: "inst-1".to_owned(),
        added_at: "2026-01-01".to_owned(),
    };
    let pb = stored_to_pb(&r);
    assert_eq!(pb.id, "owner/repo");
    assert_eq!(pb.name, "repo");
    assert_eq!(pb.full_name, "owner/repo");
    assert_eq!(pb.html_url, "https://github.com/owner/repo");
    assert_eq!(pb.installation_id, "inst-1");
    assert_eq!(pb.added_at, "2026-01-01");
}

#[test]
fn text_references_case_exact_match() {
    assert!(text_references_case("cases/auth/login.md", "auth/login"));
}

#[test]
fn text_references_case_no_false_positive_suffix() {
    assert!(!text_references_case(
        "cases/auth/login-mobile.md",
        "auth/login"
    ));
}

#[test]
fn text_references_case_commit_message_match() {
    assert!(text_references_case("fix auth/login flow", "auth/login"));
}

#[test]
fn text_references_case_no_false_positive_in_commit() {
    assert!(!text_references_case("fix auth/login flow", "auth/log"));
}

#[test]
fn text_references_case_start_of_string() {
    assert!(text_references_case("auth/login.ts", "auth/login"));
}

#[test]
fn text_references_case_subdirectory() {
    assert!(text_references_case("src/auth/login/form.ts", "auth/login"));
}

#[test]
fn text_references_case_no_match() {
    assert!(!text_references_case("src/auth/signup.md", "auth/login"));
}

#[test]
fn text_references_case_trailing_slash_in_path() {
    assert!(text_references_case(
        "cases/auth/login/step1.md",
        "auth/login"
    ));
}

#[test]
fn text_references_case_in_parentheses() {
    assert!(text_references_case(
        "fix (auth/login) redirect",
        "auth/login"
    ));
}

#[test]
fn text_references_case_in_quotes() {
    assert!(text_references_case(
        "see 'auth/login' for details",
        "auth/login"
    ));
    assert!(text_references_case(
        r#"see "auth/login" for details"#,
        "auth/login"
    ));
}

#[test]
fn text_references_case_no_match_prefix_only() {
    // "auth/login" is a prefix of "auth/login-flow" — should NOT match
    assert!(!text_references_case(
        "src/auth/login-flow.ts",
        "auth/login"
    ));
}

#[test]
fn text_references_case_newline_boundary() {
    assert!(text_references_case("fix\nauth/login\ndone", "auth/login"));
}

#[test]
fn text_references_case_tab_prefix() {
    assert!(text_references_case("\tauth/login", "auth/login"));
}

#[test]
fn text_references_case_tab_suffix() {
    assert!(text_references_case("auth/login\tnotes", "auth/login"));
}

#[test]
fn text_references_case_paren_suffix() {
    // ends_cleanly allows ')' — path followed by closing paren
    assert!(text_references_case(
        "see (auth/login) for more",
        "auth/login"
    ));
}

#[test]
fn text_references_case_starts_with_path_dirty_suffix_no_match() {
    // text begins directly with case_path but is followed by '-' which is not a clean boundary
    assert!(!text_references_case("auth/login-mobile", "auth/login"));
}

#[test]
fn text_references_case_double_quote_prefix() {
    // '"' is in the prefix list — path led by a literal double-quote should match
    assert!(text_references_case(
        "\"auth/login\" is a case",
        "auth/login"
    ));
}

#[test]
fn text_references_case_second_occurrence_with_clean_boundary_matches() {
    // First '/'-prefixed occurrence has a dirty suffix (-mobile); the second is clean.
    // The loop must check all occurrences, not just the first one found.
    assert!(text_references_case(
        "/auth/login-mobile\n/auth/login",
        "auth/login"
    ));
}

#[test]
fn text_references_case_dot_suffix() {
    // '.' is a clean boundary — path followed by a file extension counts as a reference.
    assert!(text_references_case("update auth/login.md", "auth/login"));
    assert!(text_references_case("/auth/login.rs changed", "auth/login"));
}

#[test]
fn text_references_case_exact_match_start_of_string_empty_suffix() {
    // text IS exactly the case_path — empty suffix satisfies ends_cleanly via is_empty().
    assert!(text_references_case("auth/login", "auth/login"));
}

#[test]
fn text_references_case_starts_with_path_space_suffix() {
    // starts_with branch: path at position 0, clean boundary via ' '.
    assert!(text_references_case("auth/login is fixed", "auth/login"));
}

#[test]
fn is_doc_file_no_extension_not_doc() {
    assert!(!is_doc_file("Makefile"));
    assert!(!is_doc_file("README"));
}

#[test]
fn is_doc_file_toml_not_doc() {
    // .toml is NOT in doc_exts, so it counts as a source file for source_changed logic.
    assert!(!is_doc_file("Cargo.toml"));
    assert!(!is_doc_file("config/settings.toml"));
}

#[test]
fn is_doc_file_markdown() {
    assert!(is_doc_file("cases/auth/login.md"));
}

#[test]
fn is_doc_file_yaml() {
    assert!(is_doc_file("config/suite.yaml"));
    assert!(is_doc_file("config/suite.yml"));
}

#[test]
fn is_doc_file_txt() {
    assert!(is_doc_file("notes.txt"));
}

#[test]
fn is_doc_file_gitignore_dotfile() {
    // Path::extension() returns None for .gitignore, so we check by filename
    assert!(is_doc_file(".gitignore"));
    assert!(is_doc_file("subdir/.gitignore"));
}

#[test]
fn is_doc_file_gitattributes_dotfile() {
    assert!(is_doc_file(".gitattributes"));
    assert!(is_doc_file("subdir/.gitattributes"));
}

#[test]
fn is_doc_file_source_files_not_doc() {
    assert!(!is_doc_file("src/auth.rs"));
    assert!(!is_doc_file("src/main.ts"));
    assert!(!is_doc_file("app.py"));
}

#[test]
fn find_uncovered_files_excludes_doc_files() {
    let files = vec!["README.md".to_string(), "docs/guide.yml".to_string()];
    let known: Vec<String> = vec![];
    assert!(find_uncovered_files(&files, &known).is_empty());
}

#[test]
fn find_uncovered_files_excludes_covered_source_files() {
    let files = vec!["src/auth/login.ts".to_string()];
    let known = vec!["auth/login".to_string()];
    assert!(find_uncovered_files(&files, &known).is_empty());
}

#[test]
fn find_uncovered_files_returns_uncovered_source_files() {
    let files = vec!["src/auth/signup.ts".to_string()];
    let known = vec!["auth/login".to_string()];
    let result = find_uncovered_files(&files, &known);
    assert_eq!(result, vec!["src/auth/signup.ts"]);
}

#[test]
fn find_uncovered_files_mixed() {
    let files = vec![
        "src/auth/login.ts".to_string(),
        "src/auth/signup.ts".to_string(),
        "README.md".to_string(),
    ];
    let known = vec!["auth/login".to_string()];
    let result = find_uncovered_files(&files, &known);
    assert_eq!(result, vec!["src/auth/signup.ts"]);
}

#[test]
fn text_references_case_single_quote_prefix() {
    // '\'' is in the prefix list — path led by a single-quote should match
    assert!(text_references_case(
        "'auth/login' was tested",
        "auth/login"
    ));
}

#[test]
fn text_references_case_single_quote_suffix() {
    // '\'' in ends_cleanly — path at start of text followed by single-quote
    assert!(text_references_case("auth/login'", "auth/login"));
}

#[test]
fn text_references_case_open_paren_prefix() {
    // '(' is in the prefix list — path inside parens should match when suffix is clean
    assert!(text_references_case(
        "see (auth/login) for details",
        "auth/login"
    ));
}

#[test]
fn text_references_case_newline_suffix_via_starts_with() {
    // ends_cleanly '\n' branch via the starts_with path (path at start of text, \n suffix)
    assert!(text_references_case("auth/login\nmore text", "auth/login"));
}

#[test]
fn text_references_case_double_quote_suffix_via_starts_with() {
    // ends_cleanly '"' branch via the starts_with path (path at start of text, " suffix)
    assert!(text_references_case("auth/login\" extra", "auth/login"));
}

#[test]
fn text_references_case_slash_suffix_via_starts_with() {
    // ends_cleanly '/' branch via the starts_with path (path at start of text, / suffix)
    assert!(text_references_case("auth/login/nested", "auth/login"));
}

#[test]
fn text_references_case_close_paren_suffix_via_starts_with() {
    // ends_cleanly ')' branch via the starts_with path (path at start of text, ) suffix)
    // Distinct from paren_suffix which hits ')' via the '(' prefix loop path.
    assert!(text_references_case("auth/login) and more", "auth/login"));
}

#[test]
fn text_references_case_dot_suffix_via_starts_with() {
    // ends_cleanly '.' branch via the starts_with path (path at start of text, . suffix)
    // Distinct from dot_suffix which hits '.' via the ' ' and '/' prefix loop paths.
    assert!(text_references_case("auth/login.md", "auth/login"));
}
