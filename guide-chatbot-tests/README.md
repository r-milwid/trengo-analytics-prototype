# Guide chatbot tests

This folder stores the Prototype Guide question corpus, external references used to shape it, and recorded test runs against the live guide proxy.

Files created by `run-guide-tests.mjs`:

- `question-bank.json`: machine-readable single-question bank and multi-turn sequences.
- `question-bank.md`: readable export of the same corpus.
- `external-references.md`: online references used to shape realistic stakeholder questions.
- `results/guide-test-run-*.json`: raw recorded test runs.
- `results/guide-test-run-*.md`: readable test-run transcript summaries.

Commands:

```bash
node guide-chatbot-tests/run-guide-tests.mjs generate
node guide-chatbot-tests/run-guide-tests.mjs test
```
