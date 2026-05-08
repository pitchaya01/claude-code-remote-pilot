## Kode Brain

This project has a Kode Brain knowledge map at `docs/brain/projects/pilot/`.

**Session start:** Run `/kodebrain reading-pack "<task>"` before touching any code.
It returns the relevant domain pages, source hints, and active warnings — 3–25× cheaper than reading source files cold.

**After editing files:** Run `/kodebrain update --files <f1> <f2>` to keep the KB current.

**Before every commit:** Run `/kodebrain update --files <changed-files>` if you haven't already in this session. The KB commit should be bundled with (or immediately precede) the source commit — never commit source changes without a matching KB update.

**For questions:** Run `/kodebrain query "<question>"` instead of reading raw source files.

**KB-first rule:** Use KB pages as primary source of truth.
Read source files directly only for targeted edits or when a node is `confidence: stale`.

KB: `docs/brain/projects/pilot/` — open `docs/brain/` in Obsidian for graph view.
