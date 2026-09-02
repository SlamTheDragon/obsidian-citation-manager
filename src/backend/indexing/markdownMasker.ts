export class MarkdownMasker {
  /**
   * Masks code blocks, inline code, HTML comments, LaTeX math blocks, and frontmatter
   * to ensure academic citations are extracted without false positives from mathematical
   * notation, programming snippets, comments, or YAML.
   */
  static maskIgnoredMarkdown(content: string): string {
    // 1. Mask frontmatter
    let masked = content.replace(/^---[\s\S]*?---\n?/m, (match) => ' '.repeat(match.length));
    // 2. Mask fenced code blocks (backticks or tildes)
    masked = masked.replace(/(?:```|~~~)[^`~]*?[\s\S]*?(?:```|~~~)/g, (match) => ' '.repeat(match.length));
    // 3. Mask HTML comments <!-- ... -->
    masked = masked.replace(/<!--[\s\S]*?-->/g, (match) => ' '.repeat(match.length));
    // 4. Mask LaTeX display math $$ ... $$
    masked = masked.replace(/\$\$[\s\S]*?\$\$/g, (match) => ' '.repeat(match.length));
    // 5. Mask LaTeX inline math $ ... $
    masked = masked.replace(/\$(?!\s)[^\$\n]+(?<!\s)\$/g, (match) => ' '.repeat(match.length));
    // 6. Mask inline code ` ... `
    masked = masked.replace(/`[^`\n]+`/g, (match) => ' '.repeat(match.length));
    return masked;
  }
}
