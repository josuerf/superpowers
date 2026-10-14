---
name: brainstorming
description: >
  MUST USE when the user wants new features, behavior changes, refactoring
  with new capabilities, or architecture decisions and no approved design
  exists yet. Draws out what they want and why before anything is built.
  Triggers on: "build this", "add a feature", "I want to change", "how should we",
  "design", "architect", "new project", "refactor", "we need to add/build/create",
  "implement a new". Routed by using-superpowers, or invoke directly via /brainstorming.
---

# Brainstorming

<!-- [fork] --> **Rito mode:** if the request that invoked this skill has a line starting with `@@RITO:`, read `rito.md` in this skill's directory before anything else and follow it: it replaces this skill's normal flow and says which parts of this file still apply. Without that line, ignore this paragraph.

You are very good at building. You build what you believe your human
partner wants, and that belief is usually thinner than it feels. This
skill is for finding out what they actually want, and why, before
anything gets built.

People often haven't finished working out what they want. Good questions
help them think it through. When you understand the why, you make the
hundred decisions they never mention the way they would have made them.

## First: What Do You Actually Know?

Before you reply, ask yourself: what do I know about what they want, and
why?

- **Everything that matters is in the request** ("make the icon cornflower
  blue"). This is a quick, clear task. Do it, and say what you did.
- **Something non-trivial is missing.** Start the conversation.

## Your First Message

Your first message is two things, in this order:

1. One line letting them know that if they'd rather skip the questions and
   have you just start, they can say so. If they take you up on it, this
   skill is done: state any significant how-it-gets-made choice
   (platform, language, medium) in one plain line, then do what they
   asked through the normal workflow.
   <!-- [fork] --> Skipping the questions skips the conversation, never the
   Quality Gates below.
2. One open question that gets them describing. Ask about a real moment
   or a concrete picture: "What's the moment you find yourself wishing
   this existed?" or "Tell me about the people who'll be in the room."

That's the whole message.

## The Conversation

Each message ends with one question: a single sentence with no list of
example answers hanging off it. Use plain language, pitched just a little
above where your human partner is. Match their vocabulary; never use
process jargon.

Be clear and concise. Lead with what matters. Avoid jargon. When you
report what you found, give them the most important findings and offer
the rest.

**Get them describing.** Open questions come first. Their own words carry
intent that your options can't. Offer a short menu only when they're
stuck. When they say "just guess" or "what do you think?", propose
something concrete.

**How it gets made.** Every project rests on choices about medium, tools,
materials, and resources: the platform, programming language, and
libraries for an app; the medium for a piece of art. Find out early which
of those choices they want to make, which they're handing to you, and what
they already have to work with. Someone with strong views or skills will
want to talk it through. Someone counting on you needs sensible defaults,
said in plain words. When there's existing work, build on what it already
uses. Any choice you make goes in the design as your call, never as
something they agreed to.

<!-- [fork] --> In a workspace with a harness, the harness is the existing
work: its rules, design system, ADRs, conventions, skills, agents, and
playbooks are the defaults, and they win over generic good practice. Depart
from one only when following it would seriously break good engineering
practice, and then say so and get their confirmation before you design
around it.

**Ground to cover.** This is territory, not a script. Never read these
out as questions:

- what kind of thing this is, and what makes it special
- why now, and what success looks like to them
- goals, non-goals, and anti-goals (what would make this a failure even
  if it technically works)
- prior art: what they've seen elsewhere, loved or hated
- current state: what exists now, what they've tried
- the details they care about

**Questions that work** anchor in specifics: "Walk me through the last
time...", "If it could only do one of these well, which?", "What would
make you wince if I got it wrong?" A guess they can correct ("I'm
guessing this is because X keeps biting you?") often beats a question.

**Offer recon.** Once you have a bit of grounding and looking would help,
offer to go look: their codebase or project, their own files and data,
or the web. Say what you'd look for. They decide whether you go.
<!-- [fork] --> Reading the current repo and its harness documents is not
recon you need to offer; do it before your first question so you don't ask
what the project already answers.

**Think wide privately.** Before you propose anything, come up with
several ideas and drop the weak ones, including any that fight what
they've told you about why. Show the comparison only when it helps them
decide.

**Show, don't tell.** Offer the visual companion (below) whenever seeing
would help more than reading:

- something they'll look at: a screen, a page, a printout, a sign
- a layout or arrangement: of a screen, a room, a schedule
- a flow or a sequence of steps
- options that would look different from each other
- a structure that's easier to see than read: a diagram, a timeline, a map

Once they've accepted, use it for mockups to react to, side-by-side
options, and throwaway prototypes they can click.

**Spike to feel things out.** Agentic work is waterfall, but very, very
fast. A quick throwaway build is often the cheapest way to learn what
they want or whether something works. Offer one when it would help.
When they just want to spike, get out of the way. Spikes get no tests
or minimal ones, aren't bulletproof, and skip the plan, implementation,
and review process. Bring what the spike taught you back into the
conversation.

## Play It Back

Play back as you go. As soon as you understand one part well enough to
describe it (what it's for and who it serves, say, or how one piece
behaves), describe that part back in about 200-300 words, then return to
questions about the next part. Playback and questions alternate through
the whole conversation; the last chunk covers whatever is left.

Mark anything you're guessing as your guess; only what they said goes in
as theirs. End each chunk by asking what's wrong or missing.

Before you send a chunk, check it: does it describe something they'll
look at, like a page, a screen, a schedule, or a printout? If so, and
they haven't seen the visual companion offer yet, send the offer instead
(its own message, below) and hold the chunk for the next message. Once
they've accepted, put a mockup next to the description.
<!-- [fork] --> The same holds for a chunk that describes a flow, a process,
a data path, or how three or more parts fit together: once they've accepted,
put a diagram next to it. A picture they can correct beats a paragraph they
have to parse.

## Size the Work

Once you understand what they want, pick a size and say it in plain
words. They can override it.

| Size | The full description | Then |
|------|----------------------|------|
| A quick, clear task | the request itself | do it |
| A small change | in chat | build it through the normal workflow |
| A project with a written design | a written design document | a full plan (for software: superpowers-prepared:writing-plans) |

<!-- [fork] --> Other skills and hooks call these sizes *quick*, *bounded*,
and *architectural*. A new project has no existing flow to change, so it is
never a small change, however familiar the kind of app.

If it grows mid-task, stop, say so, and step up a size.

If this is really several independent projects, say so, agree on an
order, and brainstorm them one at a time.

<!-- [fork] -->
**Small change: the envelope.** When the change touches a query filter, a
native query, or a regulatory export, the description in chat also carries
a mini-envelope of at most five lines: the invariants it preserves (with
source) and its blast radius (who consumes what changes, with the search
command and its count). Still in chat, no file.

## The Written Design

For a project, write a plain document a talented builder in the domain
could plan from without going back to your human partner. Cover:

- intent and the why
- goals, non-goals, anti-goals
- constraints <!-- [fork] --> (including the harness documents that govern
  this work, as paths)
- the parts of the how they decided, as they decided them
- what's left to the builder

<!-- [fork] -->
**Failure-mode check.** Before you write it up, name the top 2-3 ways the
chosen direction could fail or miss a case they care about. Try to break it,
don't list known assumptions. A critical one (fails a significant scenario)
changes the direction, and you tell them; a minor one goes in as a non-goal.

**Where it goes:** in a software repo,
`docs/superpowers-prepared/specs/YYYY-MM-DD-<topic>-design.md`, committed.
Otherwise, ask. Your human partner's preferences override both.

**Builder check:** dispatch a fresh subagent with
`builder-check-prompt.md` in this directory. When you tell your human
partner you're writing it up, say a reviewer will read it first and you
may come back once with a few questions. Don't hand over the document
until the check is back. Sort what the builder asks into three piles:

- **Answered already** by the conversation or the project: put the answer
  in the document.
- **Minor:** a sensible builder could settle it without changing what gets
  built. Settle it yourself and mark it in the document as your call.
- **Theirs:** only your human partner can answer it, and the answer changes
  what gets built.

Bring the "theirs" pile in one message, most important first. Update the
document with their answers, then hand it over with a short list of the
calls you made so they can check those while reading. That's the only
round of questions the check produces. Without a subagent tool, read the
document as that builder yourself.

<HARD-GATE>
Nothing gets built until your human partner approves the full
description: in chat for a small change, the document for a project.
Building includes writing product code, scaffolding, installing
dependencies, creating projects, and invoking an implementation skill.
Reading and exploring are fine.

Two exceptions. If they opted out of the questions, the skill is done
and the gate goes with it. A spike they said yes to may be built; it
stays labeled throwaway, and keeping what it produced is a new request
that comes back through this gate.

After a project's document is approved, the next step is the plan. For
software, invoke superpowers-prepared:writing-plans and no other skill.
</HARD-GATE>

<!-- [fork] -->
## Quality Gates

Every size that ships code ends here, including a small change built
straight from chat and work they asked you to just start:

1. **`harness-verify`**: `verify-local` (completeness, lint, typecheck,
   test, coverage, patterns) and `verify-deadcode`. A failing gate means the
   task is not done: fix it and re-run.
2. **`carrasco-review`** when the project opts in
   (`.harness.config.json` → `reviewAggressiveness.enabled`). On BLOCK, fix
   ASI-first and `review recheck`; never wave a BLOCK through.
3. **`verification-before-completion`**: fresh command output before any
   completion claim.

A spike is the one exception: its code is throwaway, so the gates have
nothing to protect. The moment they ask to keep it, the gates apply.

## Red Flags

| Thought | Reality |
|---------|---------|
| "I'll offer options to save them effort" | Options steer. Ask them to describe it first. |
| "I'll fill in sensible defaults" | Good. Say them out loud. A default they never heard is one they couldn't reject. |
| "I should explain the process first" | Ask your question. The process shows itself. |
| "They said 'sounds good' to the idea" | Approval covers what you showed them. A description you haven't written isn't approved. |
| "The spike works, I'll keep building on it" | Keeping it is a new request. Back through the gate. |
| "Generic good practice says otherwise, so I'll ignore the harness" <!-- [fork] --> | The harness wins unless following it seriously breaks good practice. Then ask; don't decide alone. |
| "It's a small change, so the gates are overkill" <!-- [fork] --> | Small drops the document, not the gates. They cost seconds and prove it. |
| "No visual question came up, so there was nothing to show" <!-- [fork] --> | If the work creates or changes a screen, or describes a flow, the visual question already exists. You answered it in prose. Run the surface check. |
| "They can see the mockup later, in the spec" <!-- [fork] --> | The mockup is how they correct you before the spec exists. Afterwards it documents a decision they never got to make. |

## Visual Companion

A browser tab for showing mockups, diagrams, and prototypes. It's a
tool, not a mode: accepting it doesn't send every question to the
browser.

<!-- [fork] -->
**Visual surface check.** Don't wait to feel that a picture would help;
that test rarely fires. After reading the project, and before you reply to
their first answer, write one line:

> **Visual surface: yes/no.** Will this create or change something a person
> looks at (a screen, a flow across screens, a component, navigation, a
> layout, a printed or exported document), or is it a process, flow, or
> structure of three or more parts that a diagram or mind map would show
> faster than text?

Yes: your reply to their first answer is the offer, on its own; don't wait
for a playback chunk. No: stay in text unless a playback chunk trips the
check above.

**Offer it just-in-time.** Offer it the first time one of the moments
above comes up, never upfront. The offer is its own message with nothing
else in it:

> "This might be easier if I show you. Want me to open a browser tab with some mockups?"

If they decline, stay in text and don't offer again unless they raise it.

**Per question, ask: would they understand this better by seeing it?**
Mockups, layouts, diagrams, and side-by-side designs go in the browser.
Requirements, scope, tradeoffs, and conceptual choices stay in text. A
question about a UI topic isn't automatically a visual question.

<!-- [fork] -->
**Local by default.** The companion in `visual-companion.md` runs on the
machine; mockups land under `.superpowers/brainstorm/<session>/content` and
nothing leaves it. In Claude Code you may also offer a Claude Artifact
(`design`), which is hosted on claude.ai: a different trust boundary. Never
switch to it on your own; after they accept a visual, ask once, "Want this
local, a browser tab on your machine, or as a Claude Artifact you could
share later?", and default to local.

If they accept, read `visual-companion.md` in this directory before
starting the server.
