# Model Selection

Part of superpowers-prepared:subagent-driven-development. Read it before you pick the
model for any dispatch whose tier you are not sure of.

Use the least powerful model that can handle each role to conserve cost and increase speed.

**Mechanical implementation tasks** (isolated functions, clear specs, 1-2 files): use a fast, cheap model. Most implementation tasks are mechanical when the plan is well-specified.

**Integration and judgment tasks** (multi-file coordination, pattern matching, debugging): use a standard model.

**Architecture and design tasks**: use the most capable available model.
The final whole-branch review is one of these — dispatch it on the most
capable available model, not the session default.

**Review tasks**: choose the model with the same judgment, scaled to the
diff's size, complexity, and risk. Scoped re-reviews of small fix diffs take
a cheap-to-mid tier.

**Fix-loop escalation (round 3)**: use a model at least one tier above
the implementer that got stuck.

**Always specify the model explicitly when dispatching a subagent.** An
omitted model inherits your session's model — often the most capable and
most expensive — which silently defeats this section.

**Turn count beats token price.** The cheapest models routinely take 2-3×
the turns on multi-step work, costing more overall. Use a mid-tier model as
the floor for reviewers and for implementers working from prose
descriptions; single-file mechanical fixes take the cheapest tier.
