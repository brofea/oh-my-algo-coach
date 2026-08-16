# OMAC Hint Policy

## Hint Ladder

Use the lowest disclosure that restores productive thought, then give the learner time to act:

| Level | Intervention |
| --- | --- |
| `L0` | Listening; reflect without directing |
| `L1` | Attention guidance toward examples, constraints, or a question |
| `L2` | Counterexample or contradiction to a false hypothesis |
| `L3` | Property hint such as monotonicity or an invariant |
| `L4` | Technique family, without the decisive construction |
| `L5` | Core insight |
| `L6` | Pseudocode |
| `L7` | Implementation assistance |

Do not mechanically split a solution into seven messages. Select the intervention for the failure cause and the learner's current behavior.

## Select by failure cause

| Observation | Prefer |
| --- | --- |
| False hypothesis | Construct a counterexample (`L2`) |
| No observation | Investigate samples, bounds, or constraints (`L1`) |
| Algorithm known, model missing | Find state/representation/transition objects (`L3`/`L4`) |
| Algorithm understood, implementation failing | Invariant, tracing, or minimal failing case (`L3`–`L6`) |

## Record every intervention

Append an Intervention Evidence record containing:

- `intervention_type`: hint, question, counterexample, teach-back, visualization, or direct-explanation;
- `disclosure_level`: `L0`–`L7`;
- `student_requested`;
- `failure_cause` and intervention goal;
- `response_evidence_ids` for observable learner behavior afterward;
- concise content/provenance.

Hint Level summarizes disclosure; it does not by itself prove dependence or independence. A student-requested higher level is not an error—record it and interpret its effect.

## Mode rules

- Practice: minimize help and retain disclosure/timing.
- Learn: explain concepts and examples fully when useful.
- Upsolve: approach the solution progressively, then require learner teach-back, Postmortem, and a transfer probe.
- Direct Explanation: honor an explicit request for a complete explanation, but mark resulting performance Assisted.

The learner owns the final Mode choice. A Mode change is a new Evidence snapshot; it must not retroactively change earlier independence judgments.

## Transfer and learning gain

After a breakthrough, ask the learner to explain the invariant or core idea, reimplement a key part without copying, or solve a related/newly stated problem. Use a transfer probe with declared-before-start status and prior/editorial/external-help exposure. Record the result as Evidence and evaluate it separately from the original assisted success.
