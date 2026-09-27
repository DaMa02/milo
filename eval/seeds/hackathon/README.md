# Seeds from the hackathon tests

`utterances.jsonl` holds 188 distinct user utterances found in the hackathon prototype's tests (commit `ed9c4bf`), with the action the old code expected:
- `server-py/tests/test_interpret.py`: grammar phrases, model cases, Jev cases;
- `server-py/tests/test_chat.py`: general questions and web searches;
- `server-py/tests/test_voice.py`: the speech-to-text test sentence;
- `web/tests/*.spec.ts`: the mocked interpretations and the commands checked against the grammar.

Fields: `id`, `text`, `lang` (guessed from the words), `source` (`path:line` at `ed9c4bf`, read with `git show ed9c4bf:<path>`), `old_action` (the old one-action-per-utterance format, verbatim; `null` when the test gave none), `notes`.

**What they are for.** Seeds for the development corpus (plan card VAL-2): they must be converted to the new command format (C3) and reviewed by hand. They are **not** test items, and the old action is not the expected answer in the new design (for example, compound requests now produce several commands).

**Licence.** MIT, like the rest of the repository: these sentences come from our own tests. Each line was checked against its source line.
