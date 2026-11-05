'use strict';
const assert = require('assert');
const test = require('node:test');
const { cleanTheme } = require('../src/theme');

const base = { bg: '#111827', text: '#E5E7EB', accent: '#F59E0B', accent2: '#D97706' };

test('theme needs the four colours', () => {
  assert.strictEqual(cleanTheme(null), null);
  assert.strictEqual(cleanTheme({ ...base, bg: 'red' }), null);
  assert.deepStrictEqual(cleanTheme(base, 5), { ...base, at: 5 });
});

test('theme keeps tab colours and a known texture, drops the rest', () => {
  const t = cleanTheme({ ...base, tab: '#8B5A2B', tabText: '#FFFFFF', tabEdge: '#5C3A1A', tabTex: 'planks', url: 'x', anim: 'glow', evil: '#000000' }, 1);
  assert.deepStrictEqual(t, { ...base, at: 1, tab: '#8B5A2B', tabText: '#FFFFFF', tabEdge: '#5C3A1A', tabTex: 'planks', anim: 'glow' });
  assert.strictEqual(cleanTheme({ ...base, tabTex: 'url(http://x)' }, 1).tabTex, undefined);
  assert.strictEqual(cleanTheme({ ...base, tab: 'url(x)' }, 1).tab, undefined);
});

test('theme light variant keeps tab colours', () => {
  const t = cleanTheme({ ...base, light: { bg: '#FFFFFF', text: '#111827', accent: '#D97706', accent2: '#F59E0B', tab: '#FDE68A', tabEdge: '#bad' } }, 1);
  assert.strictEqual(t.light.tab, '#FDE68A');
  assert.strictEqual(t.light.tabEdge, undefined);
});
