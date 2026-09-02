# Citation Linter Rules & Diagnostic Catalog

The Diagnostic Linter monitors registered notes to find formatting and reference errors.

---

## Rule Catalog

### 1. `format_mismatch` (Severity: Warning)
- **Description**: The in-text citation format does not match the active bucket standard (such as an author-date token `(Smith, 2024)` in a bucket set to IEEE `[1]`).
- **Suggested Fix**: Converts the token into the bucket active in-body standard.

### 2. `style_mismatch` (Severity: Info)
- **Description**: Citation punctuation deviates from CSL rules (such as missing commas in author lists).
- **Suggested Fix**: Re-formats the token with standard punctuation.

### 3. `orphan_definition` (Severity: Warning)
- **Description**: A footnote definition exists at the bottom of a document without an in-text callout.
- **Suggested Fix**: Deletes the unused footnote definition from the document.

### 4. `unresolved` (Severity: Error)
- **Description**: A citekey token in text has no matching Markdown file in `.references/`.
- **Action Choices**:
  - **`+ Create Reference`**: Opens the Reference Editor with the citekey.
  - **`Purge`**: Removes the invalid token from the note.
  - **`Dismiss`**: Silences the warning and saves the hash in `.references/.cache/dismissed_lints.json`.

### 5. `compounded_order_mismatch` (Severity: Info)
- **Description**: A compound citation group has the wrong sort order.
- **Suggested Fix**: Re-orders entries to meet the manual style rules.

---

## Diagnostic Accordion & Batch Operations

- **State 1 (Collapsed)**: Shows checkbox, severity icon, title, and line number.
- **State 2 (Expanded)**: Shows detailed explanation, diff preview, and action buttons.
- **Batch Fixing**: Select multiple checkboxes and click **Apply Selected Fixes** to repair issues in one step.
