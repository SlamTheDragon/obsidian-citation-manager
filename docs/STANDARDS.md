# Academic Citation Standards & Formatting Manual

Obsidian Citation Manager supports five academic style manuals.

---

## 1. Summary of Standards

| Standard | In-Body Parenthetical | In-Body Narrative | In-Body Citekey | Reference List Format |
| :--- | :--- | :--- | :--- | :--- |
| **APA 7th** | `(Vaswani et al., 2017)` | `Vaswani et al. (2017)` | `[@Vaswani2017]` | Hanging indent, Authors (Year). Title. *Publication*, Vol(Issue), pp. |
| **IEEE** | `[1]` | `Vaswani et al. [1]` | `[@Vaswani2017]` | `[1] A. Vaswani et al., "Title," *Publication*, vol. X, no. Y, pp. Z, 2017.` |
| **Harvard** | `(Vaswani et al. 2017)` | `Vaswani et al. (2017)` | `[@Vaswani2017]` | Authors (Year) 'Title', *Publication*, Vol(Issue), pp. |
| **Chicago 17th** | `(Vaswani et al. 2017)` | `Vaswani et al. (2017)` | `[@Vaswani2017]` | Authors. Year. "Title." *Publication* Vol (Issue): pp. |
| **Vancouver** | `(1)` | `Vaswani et al. (1)` | `[@Vaswani2017]` | `1. Vaswani A, et al. Title. Publication. 2017;Vol(Issue):pp.` |

---

## 2. In-Text Author Rules

### 1 Author
- APA 7: `(Smith, 2024)`
- Narrative: `Smith (2024)`

### 2 Authors
- APA 7: `(Smith & Carter, 2024)`
- IEEE Narrative: `Smith and Carter [2]`

### 3 or More Authors
- APA 7: `(Vaswani et al., 2017)`
- IEEE: `[1]`
- Narrative: `Vaswani et al. (2017)`

---

## 3. Compound Citation Merging

When multiple citations occur at one location, the engine merges them:

- **Author-Date Standards (APA 7, Harvard, Chicago)**:
  - Sorts alphabetically by author surname, then by year.
  - APA 7: `(Carter et al., 2026; Li, 2024; Norman, 2013)`
  - Harvard: `(Carter et al. 2026; Li 2024; Norman 2013)`

- **Numeric Standards (IEEE, Vancouver)**:
  - Sorts numerically by citation index.
  - IEEE: `[1, 3, 5]`
  - Vancouver: `(1, 3, 5)`

---

## 4. Multi-Document Sequential Indexing

For numeric standards (IEEE and Vancouver), the indexer computes numbers across all linked documents in a bucket:
1. Scans all linked documents in order.
2. Assigns sequential number `N` to the first instance of each citekey.
3. Updates in-text citations and the master bibliography with this numbering.
