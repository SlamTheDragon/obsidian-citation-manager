import { ReferenceMetadata } from '../types';

export class BibTeXGenerator {
  /**
   * Generates BibTeX string for a reference
   */
  static generateBibTeX(ref: ReferenceMetadata): string {
    const typeMap: Record<string, string> = {
      journal: 'article',
      conference: 'inproceedings',
      book: 'book',
      webpage: 'misc',
      blog: 'misc',
      video: 'misc',
      preprint: 'article',
      report: 'techreport',
      thesis: 'phdthesis',
      standard: 'standard',
      other: 'misc'
    };

    const bibType = typeMap[ref.type] || 'misc';
    const lines: string[] = [];
    lines.push('@' + bibType + '{' + ref.citekey + ',');
    lines.push('  title = {' + (ref.title || '') + '},');
    if (ref.authors && ref.authors.length > 0) {
      lines.push('  author = {' + ref.authors.join(' and ') + '},');
    }
    if (ref.year) lines.push('  year = {' + ref.year + '},');
    if (ref.publication) {
      if (bibType === 'article') lines.push('  journal = {' + ref.publication + '},');
      else if (bibType === 'inproceedings') lines.push('  booktitle = {' + ref.publication + '},');
      else lines.push('  publisher = {' + ref.publication + '},');
    }
    if (ref.publisher && bibType !== 'article') lines.push('  publisher = {' + ref.publisher + '},');
    if (ref.volume) lines.push('  volume = {' + ref.volume + '},');
    if (ref.issue) lines.push('  number = {' + ref.issue + '},');
    if (ref.pages) lines.push('  pages = {' + ref.pages + '},');
    if (ref.doi) lines.push('  doi = {' + ref.doi + '},');
    if (ref.issn) lines.push('  issn = {' + ref.issn + '},');
    if (ref.isbn) lines.push('  isbn = {' + ref.isbn + '},');
    if (ref.url) lines.push('  url = {' + ref.url + '},');
    if (ref.duration) lines.push('  note = {Duration: ' + ref.duration + '},');
    lines.push('}');
    return lines.join('\n');
  }
}
