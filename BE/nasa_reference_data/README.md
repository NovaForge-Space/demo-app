# Curated NASA reference corpus

These Markdown files were fetched from the official NASA URLs recorded in
`manifest.json`. They are reference documents for global document retrieval,
not experimental measurement tables.

To refresh the corpus:

```bash
python BE/scripts/fetch_nasa_reference_data.py
```

To submit the refreshed files to the running backend as administrator-owned
global knowledge:

```bash
set -a; . ./.env.promptfoo; set +a
npm run nasa:upload
```

The PSI repository remains separate. Select PSI investigations and preserve
their original study metadata before importing numerical data.
