# Pet Café development and certification

The user has explicitly requested batched development, not full certification after each task.

- Fast Checks are the ordinary development gate: focused tests, full unit/simulation suite and build.
- Production is manual-only. Run `suite=lifecycle` to diagnose lifecycle changes without economy simulations. Use `suite=all` for a coherent batch (roughly ten tasks), a meaningful integration checkpoint, or release.
- A failed certification blocks claiming certification and release. It does not by itself prohibit implementing independent tasks on a development branch. Fix demonstrated failures; record dependent tasks as unverified. Do not spend a turn merely waiting or restating that a gate is red.
- Certification is tied to the run's SHA, not the moving branch head. New development cannot retroactively invalidate that SHA's evidence. Certify the eventual release SHA before release.
- Keep every genuine acceptance assertion. Do not mark failing checks successful, skip tests to force green, or claim a diagnostic suite is full certification.
- Production's suites run independently; within a suite the runner records all check failures. Inspect its named result/log rather than rerunning the entire matrix to discover the next failure.
- Earlier roadmap stop rules mean a certification/release boundary under this user-requested cadence, not an instruction to halt all development indefinitely.
- Do not overwrite other agents' newer remote work or force-push. Keep main unchanged.
