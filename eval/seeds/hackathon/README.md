# Seeds from the hackathon tests

`utterances.jsonl` holds 189 records covering 182 distinct user texts found in the hackathon prototype's tests (commit `ed9c4bf`): 164 records labelled English and 25 Italian. The labels were guessed from the words and still need review. Each record preserves an old expected or mocked action when one exists:
- `server-py/tests/test_interpret.py`: grammar phrases, model cases, Jev cases;
- `server-py/tests/test_chat.py`: general questions and web searches;
- `server-py/tests/test_voice.py`: the speech-to-text test sentence;
- `server-py/tests/test_places.py`: the misheard name `Baconi University`, with the correction and no-key cases described in its notes;
- `web/tests/*.spec.ts`: the mocked interpretations and the commands checked against the grammar.

Fields: `id`, `text`, `lang`, `source` (`path:line` at `ed9c4bf`, read with `git show ed9c4bf:<path>`), `old_action`, `notes`. `old_action` records a legacy expectation or mock, not a new label: `null` means no interpretation action was supplied. Some web parameters are source expressions preserved under `_source`; some grammar checks did not record parameters. They must not be treated as complete executable actions.

Optional provenance fields preserve information without defining C8:
- `text_source`: the literal's definition when `source` uses a Python constant (hk-123, hk-124, hk-139). The original case reference stays in `source`.
- `old_context` and `old_context_sources`: the legacy interpreter context and its exact source lines for the ambiguous route duplicates (hk-005, hk-053, hk-080, hk-081). Other records do not yet have recovered context; an absent field does not mean an empty context.

**Why texts repeat.** Do not deduplicate solely by text. `Take the shortest.` selects route A in `PLAN` and route B in `REAL`; `Take the main streets.` does the reverse, because the lists have different labels. The two `let's go` records are different hard-coded web mocks, not conflicting grammar assertions. Their notes identify each other; their mocks do not supply interpreter context. Remaining duplicates preserve separate sources or differently recorded parameters.

**What they are for.** Seeds for the development corpus (plan card VAL-2): they must be converted to the new command format (C3) and reviewed by hand. They are **not** test items, and the old action is not the expected answer in the new design (for example, compound requests now produce several commands).

**Licence and verification.** MIT, like the rest of the repository: these texts come from our own tests. Every text was checked at `source`, or at `text_source` for the three constants. The recovered contexts were checked against the historical definitions. The corpus does not claim exhaustive test extraction or annotation for the new dialogue.
