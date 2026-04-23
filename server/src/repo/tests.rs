use super::*;

// -----------------------------------------------------------------------
// validate_slug_path
// -----------------------------------------------------------------------

#[test]
fn slug_path_valid_single_segment() {
    assert!(validate_slug_path("auth", "case").is_ok());
}

#[test]
fn slug_path_valid_multi_segment() {
    assert!(validate_slug_path("auth/login", "case").is_ok());
}

#[test]
fn slug_path_valid_with_hyphen_digit_underscore() {
    assert!(validate_slug_path("auth/login-flow_2", "case").is_ok());
}

#[test]
fn slug_path_empty_returns_invalid_arg() {
    let err = validate_slug_path("", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("case path is empty"));
}

#[test]
fn slug_path_dot_dot_returns_invalid_arg() {
    let err = validate_slug_path("auth/../etc", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[test]
fn slug_path_leading_slash_returns_invalid_arg() {
    let err = validate_slug_path("/auth/login", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[test]
fn slug_path_leading_backslash_returns_invalid_arg() {
    let err = validate_slug_path("\\auth", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[test]
fn slug_path_double_slash_empty_segment_returns_invalid_arg() {
    let err = validate_slug_path("auth//login", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("empty segment"));
}

#[test]
fn slug_path_uppercase_returns_invalid_arg() {
    let err = validate_slug_path("Auth/Login", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("a-z, 0-9"));
}

#[test]
fn slug_path_space_returns_invalid_arg() {
    let err = validate_slug_path("auth/lo in", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[test]
fn slug_path_trailing_slash_returns_invalid_arg() {
    let err = validate_slug_path("auth/login/", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("empty segment"));
}

#[test]
fn slug_path_dot_returns_invalid_arg() {
    let err = validate_slug_path("auth/lo.gin", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("a-z, 0-9"));
}

#[test]
fn slug_path_embedded_backslash_returns_invalid_arg() {
    // Embedded '\' is not caught by starts_with('\\'), but the segment
    // character check rejects it since '\' is not a-z/0-9/hyphen/underscore.
    let err = validate_slug_path("auth\\login", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("a-z, 0-9"));
}

#[test]
fn slug_path_single_dot_segment_returns_invalid_arg() {
    // "." as a path: not ".." so the double-dot check passes, but the segment
    // character validation rejects it because '.' is not a-z/0-9/hyphen/underscore.
    let err = validate_slug_path(".", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("a-z, 0-9"));
}

// -----------------------------------------------------------------------
// validate_priority
// -----------------------------------------------------------------------

#[test]
fn priority_low_is_valid() {
    assert!(validate_priority("low").is_ok());
}

#[test]
fn priority_medium_is_valid() {
    assert!(validate_priority("medium").is_ok());
}

#[test]
fn priority_high_is_valid() {
    assert!(validate_priority("high").is_ok());
}

#[test]
fn priority_invalid_returns_invalid_arg() {
    let err = validate_priority("critical").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("critical"));
}

#[test]
fn priority_empty_returns_invalid_arg() {
    assert!(matches!(
        validate_priority("").unwrap_err(),
        RepoError::InvalidArg(_)
    ));
}

#[test]
fn priority_uppercase_returns_invalid_arg() {
    assert!(matches!(
        validate_priority("High").unwrap_err(),
        RepoError::InvalidArg(_)
    ));
}

// -----------------------------------------------------------------------
// RepoError display
// -----------------------------------------------------------------------

#[test]
fn error_not_found_display() {
    assert_eq!(
        RepoError::NotFound("case not found: x".to_owned()).to_string(),
        "not found: case not found: x"
    );
}

#[test]
fn error_already_exists_display() {
    assert_eq!(
        RepoError::AlreadyExists("case already exists: x".to_owned()).to_string(),
        "already exists: case already exists: x"
    );
}

#[test]
fn error_closed_run_display() {
    assert_eq!(
        RepoError::ClosedRun("run x is closed".to_owned()).to_string(),
        "closed run: run x is closed"
    );
}

#[test]
fn error_invalid_arg_display() {
    assert_eq!(
        RepoError::InvalidArg("bad input".to_owned()).to_string(),
        "invalid argument: bad input"
    );
}

#[test]
fn error_other_wraps_anyhow() {
    let inner = anyhow::anyhow!("something broke");
    let err = RepoError::Other(inner);
    assert!(err.to_string().contains("something broke"));
}

// finalize_run status validation (pre-DB)
// -----------------------------------------------------------------------

fn lazy_pool() -> sqlx::PgPool {
    sqlx::postgres::PgPoolOptions::new()
        .connect_lazy("postgres://user:pass@localhost/db_does_not_exist")
        .expect("lazy pool creation should not fail")
}

#[tokio::test]
async fn finalize_run_invalid_status_returns_invalid_arg() {
    let err = finalize_run(&lazy_pool(), "owner/repo", "2026-01-01-smoke", "invalid")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("invalid finalize status"));
}

#[tokio::test]
async fn finalize_run_invalid_run_id_returns_invalid_arg() {
    // Valid status but invalid run_id — validate_slug_path fires before DB.
    let err = finalize_run(&lazy_pool(), "owner/repo", "../escape", "completed")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// delete_case_if_exists unit tests (validation only — no DB)
// -----------------------------------------------------------------------

#[test]
fn delete_case_if_exists_with_invalid_path_returns_error() {
    let err = validate_slug_path("../etc", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// record_result status validation (pre-DB)
// -----------------------------------------------------------------------

#[tokio::test]
async fn record_result_invalid_status_returns_invalid_arg() {
    let err = record_result(
        &lazy_pool(),
        "owner/repo",
        "2026-01-01-smoke",
        "auth/login",
        "unspecified",
        "",
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("invalid result status"));
}

#[tokio::test]
async fn record_result_invalid_run_id_returns_invalid_arg() {
    // Valid status but invalid run_id — validate_slug_path fires before DB.
    let err = record_result(
        &lazy_pool(),
        "owner/repo",
        "bad run",
        "auth/login",
        "passed",
        "",
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn record_result_invalid_case_path_returns_invalid_arg() {
    // Valid status and run_id — validate_slug_path on case_path fires before DB.
    let err = record_result(
        &lazy_pool(),
        "owner/repo",
        "2026-01-01-smoke",
        "bad case!",
        "passed",
        "",
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// get_case / create_case / update_case / delete_case / get_suite pre-DB
// -----------------------------------------------------------------------

#[tokio::test]
async fn get_case_invalid_path_returns_invalid_arg() {
    let err = get_case(&lazy_pool(), "owner/repo", "../escape")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_case_invalid_path_returns_invalid_arg() {
    let err = create_case(
        &lazy_pool(),
        "owner/repo",
        "../escape",
        "title",
        "",
        vec![],
        "medium",
        None,
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_case_invalid_priority_returns_invalid_arg() {
    let err = create_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        "title",
        "",
        vec![],
        "ultra",
        None,
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("invalid priority"));
}

#[tokio::test]
async fn create_case_valid_fields_passes_validation_and_hits_db() {
    // Valid path + valid priority + body: None — all validation passes, DB fails.
    let err = create_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        "Login Flow",
        "desc",
        vec![],
        "medium",
        None,
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_case_invalid_path_returns_invalid_arg() {
    let err = update_case(
        &lazy_pool(),
        "owner/repo",
        "bad path!",
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_case_invalid_priority_returns_invalid_arg() {
    let err = update_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        None,
        None,
        None,
        Some("turbo"),
        None,
        None,
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("invalid priority"));
}

#[tokio::test]
async fn update_case_no_priority_skips_validation_and_hits_db() {
    // priority: None takes the false branch of `if let Some(p) = priority`,
    // skipping validate_priority; passes pre-DB checks → DB error.
    let err = update_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        None,
        None,
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_case_invalid_path_returns_invalid_arg() {
    let err = delete_case(&lazy_pool(), "owner/repo", "../traversal")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_suite_invalid_slug_returns_invalid_arg() {
    let err = get_suite(&lazy_pool(), "owner/repo", "bad slug!")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// create_suite / update_suite / delete_suite / get_run / create_run /
// delete_run pre-DB slug validation
// -----------------------------------------------------------------------

#[tokio::test]
async fn create_suite_invalid_slug_returns_invalid_arg() {
    let err = create_suite(
        &lazy_pool(),
        "owner/repo",
        "bad slug!",
        "Name",
        None,
        vec![],
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_suite_invalid_slug_returns_invalid_arg() {
    let err = update_suite(
        &lazy_pool(),
        "owner/repo",
        "../escape",
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_suite_valid_slug_passes_validation_and_hits_db() {
    let err = update_suite(
        &lazy_pool(),
        "owner/repo",
        "regression",
        None,
        None,
        None,
        None,
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_suite_invalid_new_slug_returns_invalid_arg() {
    let err = update_suite(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        None,
        None,
        None,
        Some("bad slug!"),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_suite_valid_new_slug_passes_validation_and_hits_db() {
    // Valid new_slug passes slug validation then hits DB (not found).
    let err = update_suite(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        None,
        None,
        None,
        Some("smoke-v2"),
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_case_invalid_new_path_returns_invalid_arg() {
    let err = update_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        None,
        None,
        None,
        None,
        None,
        Some("bad path!"),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_case_valid_new_path_passes_validation_and_hits_db() {
    // Valid new_path passes path validation then hits DB (not found).
    let err = update_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        None,
        None,
        None,
        None,
        None,
        Some("auth/signin"),
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_suite_invalid_slug_returns_invalid_arg() {
    let err = delete_suite(&lazy_pool(), "owner/repo", "bad slug!")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_run_invalid_run_id_returns_invalid_arg() {
    let result = get_run(&lazy_pool(), "owner/repo", "bad run!").await;
    assert!(result.is_err());
    if let Err(err) = result {
        assert!(matches!(err, RepoError::InvalidArg(_)));
    }
}

#[tokio::test]
async fn create_run_invalid_slug_returns_invalid_arg() {
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "bad slug!",
        "tester",
        None,
        None,
        vec![],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_run_invalid_suite_slug_returns_invalid_arg() {
    // Valid run slug but invalid suite slug — validate_slug_path fires before DB.
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        Some("bad suite!".to_owned()),
        vec![],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_run_empty_suite_string_skips_validation_and_hits_db() {
    // suite: Some("") hits the `if !suite_slug.is_empty()` false branch,
    // skipping validate_slug_path entirely; passes pre-DB checks → DB error.
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        Some("".to_owned()),
        vec![],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_run_invalid_run_id_returns_invalid_arg() {
    let err = delete_run(&lazy_pool(), "owner/repo", "bad run!")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_pending_cases_invalid_run_id_returns_invalid_arg() {
    let err = get_pending_cases(&lazy_pool(), "owner/repo", "bad run!")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// validate_suite_cases: invalid case path fires before DB
// -----------------------------------------------------------------------

#[tokio::test]
async fn create_run_no_suite_passes_validation_and_hits_db() {
    // suite: None — outer `if let Some(ref suite_slug) = suite` is false, skipping
    // all suite validation; passes pre-DB checks → DB error.
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        None,
        vec![],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_run_valid_suite_slug_passes_validation_and_hits_db() {
    // Valid run slug + valid suite slug — passes validate_slug_path for both,
    // then fails at the DB EXISTS check for the suite.
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        Some("regression".to_owned()),
        vec![],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_run_with_inline_cases_passes_validation_and_hits_db() {
    // Providing inline_cases without a suite should pass validation → DB error.
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        None,
        vec!["auth/login".to_owned()],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_run_invalid_inline_case_path_returns_invalid_arg() {
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        None,
        vec!["../traversal".to_owned()],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("case path"));
}

#[tokio::test]
async fn create_run_suite_and_inline_cases_returns_invalid_arg() {
    let err = create_run(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "tester",
        None,
        Some("regression".to_owned()),
        vec!["auth/login".to_owned()],
        String::new(),
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn record_result_valid_inputs_passes_validation_and_hits_db() {
    // All three validations pass (valid status, run_id, case_path) → DB error.
    let err = record_result(
        &lazy_pool(),
        "owner/repo",
        "2026-04-21-smoke",
        "auth/login",
        "passed",
        "",
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn finalize_run_valid_inputs_passes_validation_and_hits_db() {
    // Both validations pass (valid status, run_id) → DB error.
    let err = finalize_run(&lazy_pool(), "owner/repo", "2026-04-21-smoke", "completed")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_suite_invalid_case_path_in_cases_returns_invalid_arg() {
    // Valid slug but an invalid case path in the list — validate_slug_path fires in
    // validate_suite_cases before the first DB query.
    let err = create_suite(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "Smoke Tests",
        None,
        vec!["bad path!".to_owned()],
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_case_valid_path_passes_validation_and_hits_db() {
    let err = get_case(&lazy_pool(), "owner/repo", "auth/login")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_case_valid_path_passes_validation_and_hits_db() {
    let err = delete_case(&lazy_pool(), "owner/repo", "auth/login")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_suite_valid_slug_passes_validation_and_hits_db() {
    let err = get_suite(&lazy_pool(), "owner/repo", "regression")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn create_suite_empty_cases_skips_case_validation_and_hits_db() {
    // cases: vec![] — validate_suite_cases loop body never executes;
    // passes straight to INSERT → DB error.
    let err = create_suite(
        &lazy_pool(),
        "owner/repo",
        "smoke",
        "Smoke Tests",
        None,
        vec![],
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_suite_valid_slug_passes_validation_and_hits_db() {
    let err = delete_suite(&lazy_pool(), "owner/repo", "regression")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_run_valid_run_id_passes_validation_and_hits_db() {
    let err = get_run(&lazy_pool(), "owner/repo", "2026-04-21-smoke")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_run_valid_run_id_passes_validation_and_hits_db() {
    let err = delete_run(&lazy_pool(), "owner/repo", "2026-04-21-smoke")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_pending_cases_valid_run_id_passes_validation_and_hits_db() {
    let err = get_pending_cases(&lazy_pool(), "owner/repo", "2026-04-21-smoke")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// list_* functions — no validation, always hit the DB
// -----------------------------------------------------------------------

#[tokio::test]
async fn list_cases_returns_db_error_when_no_connection() {
    let err = list_cases(&lazy_pool(), "owner/repo").await.unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn list_suites_returns_db_error_when_no_connection() {
    let err = list_suites(&lazy_pool(), "owner/repo").await.unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn list_runs_returns_db_error_when_no_connection() {
    let err = list_runs(&lazy_pool(), "owner/repo").await.unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// upsert_case unit tests (validation only — no DB)
// -----------------------------------------------------------------------

#[test]
fn upsert_case_with_invalid_priority_returns_error() {
    let err = validate_priority("critical").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("critical"));
}

#[test]
fn upsert_case_with_invalid_path_returns_error() {
    let err = validate_slug_path("", "case").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("case path is empty"));
}

// -----------------------------------------------------------------------
// validate_result_status
// -----------------------------------------------------------------------

#[test]
fn result_status_passed_is_valid() {
    assert!(validate_result_status("passed").is_ok());
}

#[test]
fn result_status_failed_is_valid() {
    assert!(validate_result_status("failed").is_ok());
}

#[test]
fn result_status_blocked_is_valid() {
    assert!(validate_result_status("blocked").is_ok());
}

#[test]
fn result_status_skipped_is_valid() {
    assert!(validate_result_status("skipped").is_ok());
}

#[test]
fn result_status_invalid_returns_invalid_arg() {
    let err = validate_result_status("pending").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("pending"));
}

#[test]
fn result_status_empty_returns_invalid_arg() {
    assert!(matches!(
        validate_result_status("").unwrap_err(),
        RepoError::InvalidArg(_)
    ));
}

#[test]
fn result_status_uppercase_returns_invalid_arg() {
    assert!(matches!(
        validate_result_status("Passed").unwrap_err(),
        RepoError::InvalidArg(_)
    ));
}

// -----------------------------------------------------------------------
// validate_finalize_status
// -----------------------------------------------------------------------

#[test]
fn finalize_status_completed_is_valid() {
    assert!(validate_finalize_status("completed").is_ok());
}

#[test]
fn finalize_status_aborted_is_valid() {
    assert!(validate_finalize_status("aborted").is_ok());
}

#[test]
fn finalize_status_in_progress_returns_invalid_arg() {
    let err = validate_finalize_status("in-progress").unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("in-progress"));
}

#[test]
fn finalize_status_empty_returns_invalid_arg() {
    assert!(matches!(
        validate_finalize_status("").unwrap_err(),
        RepoError::InvalidArg(_)
    ));
}

// -----------------------------------------------------------------------
// delete_case_if_exists / upsert_case / get_coverage_report (pre-DB)
// -----------------------------------------------------------------------

#[tokio::test]
async fn delete_case_if_exists_invalid_path_returns_invalid_arg() {
    let err = delete_case_if_exists(&lazy_pool(), "owner/repo", "../escape")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn delete_case_if_exists_valid_path_passes_validation_and_hits_db() {
    let err = delete_case_if_exists(&lazy_pool(), "owner/repo", "auth/login")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn upsert_case_invalid_path_returns_invalid_arg() {
    let err = upsert_case(
        &lazy_pool(),
        "owner/repo",
        "../escape",
        "title",
        "",
        vec![],
        "medium",
        "",
        "2026-01-01",
        "2026-01-01",
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn upsert_case_invalid_priority_returns_invalid_arg() {
    let err = upsert_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        "title",
        "",
        vec![],
        "critical",
        "",
        "2026-01-01",
        "2026-01-01",
    )
    .await
    .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
    assert!(err.to_string().contains("critical"));
}

#[tokio::test]
async fn upsert_case_valid_inputs_passes_validation_and_hits_db() {
    let err = upsert_case(
        &lazy_pool(),
        "owner/repo",
        "auth/login",
        "Login",
        "",
        vec![],
        "high",
        "",
        "2026-01-01",
        "2026-01-01",
    )
    .await
    .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_coverage_report_returns_db_error_when_no_connection() {
    let err = get_coverage_report(&lazy_pool(), "owner/repo")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn get_latest_statuses_returns_db_error_when_no_connection() {
    let err = get_latest_statuses(&lazy_pool(), "owner/repo")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

// -----------------------------------------------------------------------
// DB tests — require DATABASE_URL; run with:
//   DATABASE_URL=postgres://ameliso:ameliso@localhost/ameliso \
//     cargo test -p ameliso-server -- --include-ignored
// -----------------------------------------------------------------------

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn create_and_get_case(pool: PgPool) {
    let repo = "test-repo";
    let case = create_case(&pool, repo, "auth/login", "Login", "", vec![], "high", None)
        .await
        .unwrap();
    assert_eq!(case.case_path, "auth/login");
    assert_eq!(case.priority, "high");
    assert!(!case.body.is_empty());

    let fetched = get_case(&pool, repo, "auth/login").await.unwrap();
    assert_eq!(fetched.title, "Login");
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn create_case_duplicate_returns_already_exists(pool: PgPool) {
    let repo = "test-repo";
    create_case(&pool, repo, "auth/login", "A", "", vec![], "low", None)
        .await
        .unwrap();
    let err = create_case(&pool, repo, "auth/login", "B", "", vec![], "low", None)
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::AlreadyExists(_)));
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn get_case_not_found_returns_not_found(pool: PgPool) {
    let err = get_case(&pool, "repo", "missing/case").await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn delete_case_removes_it(pool: PgPool) {
    let repo = "test-repo";
    create_case(&pool, repo, "x/y", "T", "", vec![], "medium", None)
        .await
        .unwrap();
    delete_case(&pool, repo, "x/y").await.unwrap();
    let err = get_case(&pool, repo, "x/y").await.unwrap_err();
    assert!(matches!(err, RepoError::NotFound(_)));
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn list_cases_returns_all_for_repo(pool: PgPool) {
    let repo = "test-repo";
    create_case(&pool, repo, "a/b", "A", "", vec![], "low", None)
        .await
        .unwrap();
    create_case(&pool, repo, "c/d", "C", "", vec![], "high", None)
        .await
        .unwrap();
    let cases = list_cases(&pool, repo).await.unwrap();
    assert_eq!(cases.len(), 2);
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn create_and_finalize_run(pool: PgPool) {
    let repo = "test-repo";
    let run = create_run(
        &pool,
        repo,
        "sprint-1",
        "alice",
        None,
        None,
        vec![],
        String::new(),
    )
    .await
    .unwrap();
    assert_eq!(run.status, "in-progress");

    let finalized = finalize_run(&pool, repo, &run.run_id, "completed")
        .await
        .unwrap();
    assert_eq!(finalized.status, "completed");
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn record_result_on_closed_run_returns_closed_run(pool: PgPool) {
    let repo = "test-repo";
    create_case(&pool, repo, "a/b", "A", "", vec![], "low", None)
        .await
        .unwrap();
    let run = create_run(
        &pool,
        repo,
        "sprint-2",
        "",
        None,
        None,
        vec![],
        String::new(),
    )
    .await
    .unwrap();
    finalize_run(&pool, repo, &run.run_id, "aborted")
        .await
        .unwrap();

    let err = record_result(&pool, repo, &run.run_id, "a/b", "passed", "")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::ClosedRun(_)));
}

#[tokio::test]
async fn update_run_invalid_run_id_returns_invalid_arg() {
    let err = update_run(&lazy_pool(), "owner/repo", "bad run!", "smoke-v2")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_run_invalid_new_slug_returns_invalid_arg() {
    let err = update_run(&lazy_pool(), "owner/repo", "2026-01-01-smoke", "bad slug!")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_run_short_run_id_returns_invalid_arg() {
    // run_id shorter than 10 chars — date prefix extraction fails.
    let err = update_run(&lazy_pool(), "owner/repo", "short", "smoke-v2")
        .await
        .unwrap_err();
    assert!(matches!(err, RepoError::InvalidArg(_)));
}

#[tokio::test]
async fn update_run_valid_args_passes_validation_and_hits_db() {
    // Valid run_id + new_slug pass all validation → hits DB (no connection → DB error).
    let err = update_run(&lazy_pool(), "owner/repo", "2026-01-01-smoke", "smoke-v2")
        .await
        .unwrap_err();
    assert!(!matches!(err, RepoError::InvalidArg(_)));
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL with a running PostgreSQL instance"]
async fn suite_create_list_delete(pool: PgPool) {
    let repo = "test-repo";
    create_case(&pool, repo, "a/b", "A", "", vec![], "low", None)
        .await
        .unwrap();
    create_suite(&pool, repo, "smoke", "Smoke", None, vec!["a/b".to_owned()])
        .await
        .unwrap();

    let suites = list_suites(&pool, repo).await.unwrap();
    assert_eq!(suites.len(), 1);
    assert_eq!(suites[0].slug, "smoke");

    delete_suite(&pool, repo, "smoke").await.unwrap();
    assert!(list_suites(&pool, repo).await.unwrap().is_empty());
}
