'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseMessage, decodeWords } = require('../src/mime');

const CRLF = (s) => Buffer.from(s.replace(/\n/g, '\r\n'), 'latin1');

test('rfc2047 words', () => {
  assert.strictEqual(decodeWords('=?UTF-8?B?w6l0w6k=?= =?UTF-8?Q?_caf=C3=A9?='), 'été café');
  assert.strictEqual(decodeWords('=?ISO-8859-1?Q?Andr=E9?= <a@b.c>'), 'André <a@b.c>');
  // split multibyte char across words
  assert.strictEqual(decodeWords('=?utf-8?B?4oKs?= x =?utf-8?Q?=E2=82?= =?utf-8?Q?=AC?='), '€ x €');
});

test('multipart alternative qp + base64 + latin1', () => {
  const html = Buffer.from('<p>Hallo <a href="https://ex.com/v?a=1&amp;b=2">verify</a></p>', 'utf8').toString('base64');
  const msg = CRLF(`From: =?utf-8?Q?J=C3=B6rg?= <j@x.de>
To: test-abc@example.com
Subject: =?iso-8859-1?Q?Gr=FC=DFe?=
Date: Tue, 06 Oct 2026 10:00:00 +0000
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="outer"

preamble
--outer
Content-Type: multipart/alternative; boundary=inner

--inner
Content-Type: text/plain; charset=iso-8859-1
Content-Transfer-Encoding: quoted-printable

Gr=FC=DFe, code: 123456. Visit https://ex.com/v?a=3D1&b=3D2 or (https://ex.com/paren).=
 soft
--inner
Content-Type: text/html; charset=utf-8
Content-Transfer-Encoding: base64

${html}
--inner--
--outer
Content-Type: application/pdf; name="a.pdf"
Content-Disposition: attachment; filename="a.pdf"
Content-Transfer-Encoding: base64

JVBERi0=
--outer--
`);
  const r = parseMessage(msg);
  assert.strictEqual(r.from, 'Jörg <j@x.de>');
  assert.strictEqual(r.subject, 'Grüße');
  assert.strictEqual(r.date, Date.UTC(2026, 9, 6, 10));
  assert.match(r.text, /^Grüße, code: 123456\. Visit https:\/\/ex\.com\/v\?a=1&b=2 or \(https:\/\/ex\.com\/paren\)\. soft/);
  assert.match(r.html, /verify/);
  assert.deepStrictEqual(r.links, ['https://ex.com/v?a=1&b=2', 'https://ex.com/paren']);
});

test('html only, utf8 8bit, links from html', () => {
  const r = parseMessage(Buffer.from('Subject: hi\nContent-Type: text/html; charset=UTF-8\n\n<div>Ünïcode<br>line</div><a href=\'http://a.b/c\'>x</a> https://plain.example/z.', 'utf8'));
  assert.strictEqual(r.text, 'Ünïcode\nline\nx https://plain.example/z.');
  assert.deepStrictEqual(r.links, ['http://a.b/c', 'https://plain.example/z']);
});

test('no content-type, mislabelled latin1', () => {
  const r = parseMessage(Buffer.concat([Buffer.from('Subject: x\n\ncaf'), Buffer.from([0xe9])]));
  assert.strictEqual(r.text, 'café');
  assert.strictEqual(r.html, null);
});
