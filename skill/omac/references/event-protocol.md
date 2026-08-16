# OMAC Event and Evidence Protocol

## Common lifecycle

Every Event has a purpose, Target or Intent, Mode, Independence Boundary, and provenance. Use:

```text
draft → active ↔ paused → evaluating → closed
                         ↘ cancelled
```

Any state may become `cancelled`. `archived` is the post-close physical location under `.omac/event/archive/`, not a lifecycle state. `event close` performs final validation, closes the Event, and archives it without changing Event ID, observations, interventions, or historical Claims.

## Four-stage loop

### Choose Target / Intent

Select one of the six Event Types and a Target Contract. A Target must define an ID/version, scope, prerequisites, observable behaviors, success criteria, failure taxonomy, required Evidence, transfer probe, rubric, assessment scale, and default independence boundary. For an unlabelled Practice problem, propose a low-confidence Target and keep it provisional until confirmed.

### Train / Explore

Record facts before interpreting them. The loop is:

```text
learner action → Coach observation → Coach intervention → learner response → ...
```

Useful facts include ideas, constraints, hypotheses, counterexamples, code, run/submission results, timing, hint requests, corrections, teach-back, postmortem, and transfer attempts. Active/paused phases may append Evidence but may not write Learner Claims or Views.

### Evaluate

Evaluate only against the selected Target and Event Type. Produce structured Assessment Claims, not direct View mutations. Allow `unknown`, `insufficient_evidence`, and `conflicted`; attach an `unknown_reason` or alternative explanations instead of guessing.

### Update

Submit Claims during `evaluating`, then let Runtime reducers produce Learner Views. A single Event may update multiple dimensions, such as algorithm ability, problem-solving ability, misconceptions, retention candidates, dependency, or contest skills. Each update must retain Event, Evidence, Claim, evaluator/policy version, and reducer version links.

## Event contracts

### Learn

Use for building or rebuilding knowledge. Observe explanation, manual simulation, teach-back, recall, and implementation. Evaluate understanding, recall, recognition, and transfer. Consider a retention candidate and next review scene.

### Practice

Use for solving a problem against a Target. Observe ideas, attempts, interventions, code, runs, submissions, time, and hint disclosure. Evaluate independent insight, hint dependency, solve time, implementation independence, proof, debug, and misconception. Never count a Direct Explanation result as independent.

### Upsolve

Use for an unsolved or contest problem after preserving the original attempt. Observe original direction, failure cause, distance to the key insight, teach-back, and transfer. Evaluate pattern extraction and transfer readiness; finish with a Postmortem and follow-up practice candidate.

### Contest

Use only for a finished Contest or Virtual Contest Artifact with user confirmation that the activity ended. Observe problem selection, opening/thinking time, switching/abandoning, submission/debug timeline, and risk. Evaluate selection, time usage, direction switching, implementation, debugging, and risk management. Reject live solving requests; do not implement platform lock or anti-cheat behavior.

### Diagnose

Use for a question about learner state. Gather supporting, contradicting, and alternative Evidence. Evaluate evidence sufficiency, confidence, alternatives, and learner confirmation. Default Update to no-op until confirmation or new traceable Evidence.

### Explore

Use for an open topic, capability probe, or candidate Target. Observe new concepts, patterns, hypotheses, and follow-up value. Promote a Target or learner-state update only when it is traceable and useful for a later Event.

## Mode and Independence Boundary

Event Type says why the activity exists; Mode says how much help is allowed:

| Mode | Policy |
| --- | --- |
| `Practice` | minimum effective help; record each disclosure |
| `Learn` | complete concept explanation and examples are allowed |
| `Upsolve` | progressively approach the solution; require Postmortem and Transfer |
| `Direct Explanation` | explicit learner request; mark Assisted |

For Independent, Transferred, or Retained results, snapshot `problem_familiarity`, `prior_exposure`, `allowed_resources`, `editorial_exposure`, `algorithm_name_disclosed`, `hint_limit`, `code_assistance_allowed`, `external_help`, `time_limit`, and `evaluation_context`. If the boundary changes, record a new snapshot and keep interpretations separate.

## Evidence and Claims

Evidence is what happened; a Claim is an interpretation. Common Evidence types are `observation`, `intervention`, `correction`, `submission`, and `import`. Each Evidence should identify its event, learner/workspace, actor, time, target/artifact, source, quality, provenance, independence boundary, and operation ID.

Each Assessment Claim should identify `claim_id`, learner/workspace, `skill_id`, Target or scope, assessment, scale, evidence IDs, Evidence quality, confidence, evaluator/model/policy version, evaluation run, input snapshot, operation ID, creation time, and any `unknown_reason`, confirmation, supersession, or contradiction. Confidence is not ability score and is not Evidence quality.

When a learner corrects a fact, append Correction Evidence, run `reevaluate` to add a new or superseding Claim, then run `rebuild`. Do not silently edit history.
