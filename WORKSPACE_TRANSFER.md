# Ready Route workspace transfer

This private repository is the portable development workspace for Ready Route and the operational knowledge-system goal. The existing `metzgerphil/readyroute` repository remains the intentionally public application repository; do not push the private knowledge corpus or source archive there.

## Clone on the destination Mac

```bash
git clone https://github.com/metzgerphil/readyroute-workspace.git
cd readyroute-workspace
npm install
npm --prefix backend install
```

Install the driver and manager dependencies only when those applications need to be run. Do not create an EAS build merely to verify the knowledge system.

## Restricted source archive

Raw Google Drive files, MyGroundBiz downloads, authenticated captures, temporary renders, and video frames are intentionally excluded from GitHub. Transfer or mount the protected archive separately and restore it at these paths when source-level research is needed:

- `research/fedex-ground-driver-knowledge/sources/`
- `research/fedex-ground-driver-knowledge/captures/`
- `research/fedex-ground-driver-knowledge/reviews/video_visual/`

The committed source registry, checksums, reviews, records, coverage ledgers, and acquisition queues remain usable without those bytes. Do not claim byte-level verification when the corresponding excluded archive is unavailable.

## Resume the Codex goal

1. Open the cloned workspace in Codex.
2. Read `AGENTS.md` and `knowledge/index.md` before answering or changing FedEx operational knowledge.
3. Review `knowledge/release-status.md` and the research goal-completion matrix for current blockers.
4. Validate the committed knowledge and portable release:

```bash
(cd research/fedex-ground-driver-knowledge && python3 scripts/validate_knowledge.py)
(cd research/fedex-ground-driver-knowledge && python3 scripts/validate_reference_data.py)
npm run knowledge:release
npm --prefix backend run knowledge:validate-retrieval
```

5. After the restricted source archive has been restored or mounted at the expected paths, run the full archive-aware integrity check:

```bash
(cd research/fedex-ground-driver-knowledge && python3 scripts/validate_corpus_integrity.py)
```

That final check is expected to fail when the deliberately excluded source and capture files are absent. Do not weaken it to make a source-free clone appear complete.

The knowledge goal remains incomplete until the documented source-acquisition, review, quality-control, adversarial-completeness, and validation obligations are finished. No driver-interface deployment or EAS build is authorized by this transfer.
