import { mock } from 'bun:test';

mock.module('obsidian', () => ({
  requestUrl: async (opts: any) => ({ status: 200, json: {}, text: '' }),
  normalizePath: (p: string) => p.replace(/\\/g, '/'),
  Notice: class { constructor(public msg: string) {} },
  TFile: class { path: string = ''; basename: string = ''; },
  ItemView: class {},
  WorkspaceLeaf: class {},
  MarkdownView: class {},
  Modal: class {},
  setIcon: () => {},
  parseYaml: (s: string) => ({}),
  stringifyYaml: (o: any) => ''
}));
