# Reproducing the isolated paper study

This is an opt-in live integration test: it calls the configured Meta model for every
paper and consumes provider quota. It does not use the project's normal database or
storage. The PDF downloader uses the openly available NIH PMC AWS bucket.

From the project root in PowerShell:

```powershell
backend/.venv/Scripts/python -X utf8 e2e/download_paper_study.py
New-Item -ItemType Directory -Force .build-check/paper-study-live | Out-Null
Set-Location backend
$env:APP_ENV = 'test'
$env:DATABASE_URL = 'sqlite:///E:/ConceptLab/.build-check/paper-study-live/papers.db'
$env:STORAGE_DIR = 'E:/ConceptLab/.build-check/paper-study-live/storage'
$env:FRONTEND_DIST = 'E:/ConceptLab/.build-check/paper-study-live/no-frontend'
$env:PUBLIC_BASE_URL = 'http://127.0.0.1:18511'
$env:ALLOWED_ORIGINS = 'http://127.0.0.1:18511'
.venv/Scripts/python -X utf8 -m app.cli init-db
.venv/Scripts/python -X utf8 -m uvicorn app.main:app --host 127.0.0.1 --port 18511
```

Keep that terminal open, and in a second terminal at the project root run:

```powershell
backend/.venv/Scripts/python -X utf8 e2e/paper_study_batch.py --live
backend/.venv/Scripts/python -X utf8 e2e/audit_paper_study_refs.py
# If drafts were produced before the citation-locator fix, restart the isolated
# server with current code, then run this test-only repair and republish:
backend/.venv/Scripts/python -X utf8 e2e/repair_paper_study_refs.py
```

The runner uses a synthetic local-only teacher identity; the fixed listener address is
intentional. Ensure that this port is free before starting. It preserves completed
checkpoints so rerunning will not call the model again for successful papers. Specify
`--codes AGFARM AGWATR` to run selected records or `--analysis-only` to stop after
paper structure. Outputs and raw generated drafts are under `.build-check/paper-study-live`;
PDFs and checksums are under `.build-check/paper-study-sources`.

The script sets author confirmations solely to exercise publishing in the isolated test
instance. This is neither a human scientific review nor authorization to publish the
result to a public production site. A status marked complete validates the application
flow and citations' data shape; it does not prove claims or educational quality. The
independent audit distinguishes full text matches from prefix-only matches and unlocated
references. Original AI responses remain available for subsequent review.
