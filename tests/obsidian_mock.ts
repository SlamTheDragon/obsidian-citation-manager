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
  Setting: class {
    setName(n: string) { return this; }
    setDesc(d: string) { return this; }
    addText(cb: any) { cb({ setPlaceholder: () => {}, setValue: () => {}, onChange: () => {} }); return this; }
    addTextArea(cb: any) { cb({ setPlaceholder: () => {}, setValue: () => {}, onChange: () => {} }); return this; }
    addToggle(cb: any) { cb({ setValue: () => {}, onChange: () => {} }); return this; }
    addDropdown(cb: any) { cb({ addOption: () => {}, setValue: () => {}, onChange: () => {} }); return this; }
  },
  setIcon: () => {},
  parseYaml: (s: string) => ({}),
  stringifyYaml: (o: any) => ''
}));
