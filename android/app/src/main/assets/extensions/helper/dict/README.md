# Spell-check word lists

One lowercase word per line, most frequent first. Each list keeps only words that appear
in both a frequency list and the matching Hunspell dictionary.

- Frequency data: FrequencyWords by Hermit Dave (OpenSubtitles), CC BY-SA 4.0,
  https://github.com/hermitdave/FrequencyWords
- Word validity: Hunspell dictionaries (LibreOffice dictionaries project), used only as a
  filter. The dictionaries keep their own licences (MPL, LGPL, GPL, or Apache-2.0 depending
  on the language), see https://github.com/LibreOffice/dictionaries

These word lists are shared under CC BY-SA 4.0. The generator is `desktop/scripts/build-dicts.js`.
