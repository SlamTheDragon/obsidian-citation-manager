# Citation Linter Rules & Diagnostic Catalog

The Diagnostic Linter continuously monitors registered notes to preserve bibliographic integrity.

---

## Rule Catalog

### 1. `format_mismatch` (Severity: Warning)
* **Description**: The in-text citation format does not match the active bucket's citation standard (e.g. an author-date token `(Smith, 2024)` inside a bucket set to IEEE `[1]`).
* **Suggested Fix**: Converts the token into the bucket's active in-body standard.

### 2. `style_mismatch` (Severity: Info)
* **Description**: Citation punctuation deviates from canonical CSL rules (e.g. missing commas in APA 7 author lists).
* **Suggested Fix**: Re-formats token with canonical spacing and separators.

### 3. `orphan_definition` (Severity: Warning)
* **Description**: A footnote definition (e.g. `[^Vaswani2017]: ...`) exists at the bottom of a document without a corresponding in-text callout `[^Vaswani2017]`.
* **Suggested Fix**: Purges the unused footnote definition from the document.

### 4. `unresolved` (Severity: Error)
* **Description**: A citekey token in text (or footnote) has no matching Markdown record in `.references/`.
* **Action Decision**:
  - **`+ Create Reference`**: Opens the Reference Editor pre-populated with the citekey.
  - **`Purge`**: Strips the invalid reference token from the note.
  - **`Dismiss`**: Silences the warning, storing its hash in `.references/.cache/dismissed_lints.json`.

### 5. `compounded_order_mismatch` (Severity: Info)
* **Description**: A compound citation group is out of alphabetical or numerical sort order.
* **Suggested Fix**: Re-orders entries to meet manual standard rules.

---

## Diagnostic Accordion & Batch Operations

- **State 1 (Collapsed)**: Displays checkbox, severity icon, short title, and line number.
- **State 2 (Expanded)**: Reveals detailed explanation, visual before/after diff preview, and action buttons.
- **Batch Fixing**: Check multiple warning checkboxes and click **Apply Selected Fixes (N)** to resolve issues in a single transaction.
