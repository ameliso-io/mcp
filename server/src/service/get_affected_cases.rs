use tonic::{Request, Response, Status};

use crate::proto::ameliso_v1 as pb;
use crate::repo;

use super::{
    case_to_pb, find_uncovered_files, invalid, is_doc_file, priority_from_i32, priority_rank,
    repo_err, result_status_rank, result_status_to_i32, text_references_case, AmelisoServer,
};

pub(super) async fn handle(
    server: &AmelisoServer,
    request: Request<pb::GetAffectedCasesRequest>,
) -> Result<Response<pb::GetAffectedCasesResponse>, Status> {
    let req = request.into_inner();
    if req.repo_id.is_empty() {
        return Err(invalid("repo_id is required"));
    }

    let cases = repo::list_cases(&server.pool, &req.repo_id)
        .await
        .map_err(repo_err)?;

    let status_map = repo::get_latest_statuses(&server.pool, &req.repo_id)
        .await
        .map_err(repo_err)?;

    // If caller passed changed_files directly, skip GitHub and use those.
    if !req.changed_files.is_empty() {
        let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
        let case_map: std::collections::HashMap<&str, &repo::LoadedCase> =
            cases.iter().map(|c| (c.case_path.as_str(), c)).collect();
        let mut affected_set: std::collections::HashSet<String> = std::collections::HashSet::new();
        let mut reasons: Vec<String> = Vec::new();
        for file in &req.changed_files {
            for path in &known_paths {
                if text_references_case(file, path) {
                    reasons.push(format!("file {file} references {path}"));
                    affected_set.insert(path.clone());
                }
            }
        }
        let source_changed: Vec<&str> = req
            .changed_files
            .iter()
            .filter(|f| !is_doc_file(f))
            .map(String::as_str)
            .collect();
        if !source_changed.is_empty() && affected_set.is_empty() {
            reasons.push(format!(
                "{} source file(s) changed with no explicit case references — all {} case(s) flagged",
                source_changed.len(),
                known_paths.len()
            ));
            for p in &known_paths {
                affected_set.insert(p.clone());
            }
        }
        let mut affected: Vec<String> = affected_set.into_iter().collect();
        affected.sort_by(|a, b| {
            let sa = result_status_rank(
                status_map
                    .get(a.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            );
            let sb = result_status_rank(
                status_map
                    .get(b.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            );
            let pa = case_map
                .get(a.as_str())
                .map_or(3, |c| priority_rank(&c.priority));
            let pb_rank = case_map
                .get(b.as_str())
                .map_or(3, |c| priority_rank(&c.priority));
            sa.cmp(&sb).then_with(|| pa.cmp(&pb_rank))
        });
        let reason = if reasons.is_empty() {
            "no relevant changes in provided file list".to_owned()
        } else {
            reasons.join("; ")
        };
        if let Some(pri) = priority_from_i32(req.priority_filter) {
            affected.retain(|path| {
                case_map
                    .get(path.as_str())
                    .is_some_and(|c| c.priority.eq_ignore_ascii_case(pri))
            });
        }
        if !req.tags.is_empty() {
            affected.retain(|path| {
                case_map.get(path.as_str()).is_some_and(|c| {
                    req.tags
                        .iter()
                        .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
                })
            });
        }
        let pb_cases = affected
            .iter()
            .map(|path| pb::AffectedCase {
                case: case_map.get(path.as_str()).map(|c| case_to_pb(c)),
                reason: reason.clone(),
                latest_status: result_status_to_i32(
                    status_map
                        .get(path.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                ),
                body: case_map
                    .get(path.as_str())
                    .map(|c| c.body.clone())
                    .unwrap_or_default(),
            })
            .collect();
        let uncovered = find_uncovered_files(&req.changed_files, &known_paths);
        return Ok(Response::new(pb::GetAffectedCasesResponse {
            cases: pb_cases,
            reason,
            uncovered_files: uncovered.into_iter().map(str::to_owned).collect(),
        }));
    }

    if req.since_ref.is_empty() {
        let pri_filter = priority_from_i32(req.priority_filter);
        let mut affected: Vec<&repo::LoadedCase> = cases
            .iter()
            .filter(|c| pri_filter.is_none_or(|p| c.priority.eq_ignore_ascii_case(p)))
            .filter(|c| {
                req.tags.is_empty()
                    || req
                        .tags
                        .iter()
                        .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
            })
            .collect();
        affected.sort_by(|a, b| {
            let sa = result_status_rank(
                status_map
                    .get(a.case_path.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            );
            let sb = result_status_rank(
                status_map
                    .get(b.case_path.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            );
            sa.cmp(&sb)
                .then_with(|| priority_rank(&a.priority).cmp(&priority_rank(&b.priority)))
        });
        let pb_cases = affected
            .iter()
            .map(|c| pb::AffectedCase {
                case: Some(case_to_pb(c)),
                reason: "no since_ref provided; all cases flagged".to_owned(),
                latest_status: result_status_to_i32(
                    status_map
                        .get(c.case_path.as_str())
                        .map(String::as_str)
                        .unwrap_or("never"),
                ),
                body: c.body.clone(),
            })
            .collect();
        return Ok(Response::new(pb::GetAffectedCasesResponse {
            cases: pb_cases,
            reason: "no since_ref provided; all cases flagged".to_owned(),
            uncovered_files: vec![],
        }));
    }

    // Use GitHub compare API to find changed files.
    let stored = crate::repos_store::get(&server.pool, &req.repo_id)
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .ok_or_else(|| Status::not_found(format!("repository {} not found", req.repo_id)))?;

    let cfg = crate::github::config()
        .ok_or_else(|| Status::failed_precondition("GitHub App not configured"))?;
    let jwt = crate::github::generate_jwt(&cfg.app_id, &cfg.private_key)
        .map_err(|e| Status::internal(e.to_string()))?;
    let token = crate::github::get_installation_token(&stored.installation_id, &jwt)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let parts: Vec<&str> = stored.full_name.splitn(2, '/').collect();
    if parts.len() != 2 {
        return Err(Status::internal("invalid full_name in stored repo"));
    }
    let (owner, repo_name) = (parts[0], parts[1]);

    let compare = crate::github::compare(owner, repo_name, &req.since_ref, &token)
        .await
        .map_err(|e| Status::internal(e.to_string()))?;

    let known_paths: Vec<String> = cases.iter().map(|c| c.case_path.clone()).collect();
    let case_map: std::collections::HashMap<&str, &repo::LoadedCase> =
        cases.iter().map(|c| (c.case_path.as_str(), c)).collect();

    let mut affected: Vec<String> = Vec::new();
    let mut affected_set: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut reasons: Vec<String> = Vec::new();

    let all_text = compare.commit_messages.join("\n");
    for path in &known_paths {
        if text_references_case(&all_text, path) {
            reasons.push(format!("commit messages reference: {path}"));
            if affected_set.insert(path.clone()) {
                affected.push(path.clone());
            }
        }
    }

    for file in &compare.changed_files {
        for path in &known_paths {
            if text_references_case(file, path) {
                reasons.push(format!("file {file} references {path}"));
                if affected_set.insert(path.clone()) {
                    affected.push(path.clone());
                }
            }
        }
    }

    let source_changed: Vec<&str> = compare
        .changed_files
        .iter()
        .filter(|f| !is_doc_file(f))
        .map(String::as_str)
        .collect();

    if !source_changed.is_empty() && affected.is_empty() {
        reasons.push(format!(
            "{} source file(s) changed with no explicit case references — all {} case(s) flagged",
            source_changed.len(),
            known_paths.len()
        ));
        affected = known_paths.clone();
    }

    let reason = if reasons.is_empty() {
        "no relevant changes since last run".to_owned()
    } else {
        reasons.join("; ")
    };

    affected.sort_by(|a, b| {
        let sa = result_status_rank(
            status_map
                .get(a.as_str())
                .map(String::as_str)
                .unwrap_or("never"),
        );
        let sb = result_status_rank(
            status_map
                .get(b.as_str())
                .map(String::as_str)
                .unwrap_or("never"),
        );
        let pa = case_map
            .get(a.as_str())
            .map_or(3, |c| priority_rank(&c.priority));
        let pb_rank = case_map
            .get(b.as_str())
            .map_or(3, |c| priority_rank(&c.priority));
        sa.cmp(&sb).then_with(|| pa.cmp(&pb_rank))
    });

    if let Some(pri) = priority_from_i32(req.priority_filter) {
        affected.retain(|path| {
            case_map
                .get(path.as_str())
                .is_some_and(|c| c.priority.eq_ignore_ascii_case(pri))
        });
    }
    if !req.tags.is_empty() {
        affected.retain(|path| {
            case_map.get(path.as_str()).is_some_and(|c| {
                req.tags
                    .iter()
                    .all(|t| c.tags.iter().any(|ct| ct.eq_ignore_ascii_case(t)))
            })
        });
    }
    let pb_cases = affected
        .iter()
        .map(|path| pb::AffectedCase {
            case: case_map.get(path.as_str()).map(|c| case_to_pb(c)),
            reason: reason.clone(),
            latest_status: result_status_to_i32(
                status_map
                    .get(path.as_str())
                    .map(String::as_str)
                    .unwrap_or("never"),
            ),
            body: case_map
                .get(path.as_str())
                .map(|c| c.body.clone())
                .unwrap_or_default(),
        })
        .collect();

    let uncovered = find_uncovered_files(&compare.changed_files, &known_paths);
    Ok(Response::new(pb::GetAffectedCasesResponse {
        cases: pb_cases,
        reason,
        uncovered_files: uncovered.into_iter().map(str::to_owned).collect(),
    }))
}
