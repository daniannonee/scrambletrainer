# Third-party data notices

The app ships data derived from three outside sources. Two of them require their
copyright notice to travel with any copy, so those notices are reproduced in
full below. Ship this file with the app.

---

## ENABLE word list

The lexicon in `data/lexicon.js`.

ENABLE (Enhanced North American Benchmark LExicon) was assembled by Alan Beale
and others as an independent alternative to the copyrighted official Scrabble
dictionaries, and **placed by its creators in the public domain**. No notice is
required; it is recorded here for provenance.

See `PROVENANCE.md` for the exact file used and its checksum.

---

## SCOWL

Used to build `data/tiers.js` (which three-letter words are ordinary English,
and which six-letter words make recognisable stem names) and to decide which
words are safe to take an automatic definition for.

> The collective work is Copyright 2000-2018 by Kevin Atkinson as well as any of
> the copyrights mentioned below:
>
> Copyright 2000-2018 by Kevin Atkinson
>
> Permission to use, copy, modify, distribute and sell these word lists, the
> associated scripts, the output created from the scripts, and its documentation
> for any purpose is hereby granted without fee, provided that the above
> copyright notice appears in all copies and that both that copyright notice and
> this permission notice appear in supporting documentation. Kevin Atkinson
> makes no representations about the suitability of this array for any purpose.
> It is provided "as is" without express or implied warranty.

SCOWL's own Copyright file credits further contributors, including Alan Beale —
the same person behind ENABLE. The full upstream notice is kept in
`tools/vendor/` after a build.

---

## WordNet 3.0

Used to build `data/defs_auto.js`, the generated definitions.

> WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.
>
> Permission to use, copy, modify and distribute this software and database and
> its documentation for any purpose and without fee or royalty is hereby
> granted, provided that you agree to comply with the following copyright notice
> and statements, including the disclaimer, and that the same appear on ALL
> copies of the software, database and documentation, including modifications
> that you make for internal use or for distribution.
>
> THIS SOFTWARE AND DATABASE IS PROVIDED "AS IS" AND PRINCETON UNIVERSITY MAKES
> NO REPRESENTATIONS OR WARRANTIES, EXPRESS OR IMPLIED.
>
> The name of Princeton University or Princeton may not be used in advertising
> or publicity pertaining to distribution of the software and/or database.

The definitions in `data/defs_auto.js` are modifications: WordNet's first sense
for a word, trimmed for length. `data/definitions.js` is written for this app
and carries no WordNet obligation.

Princeton's own guidance notes that a commercial user should have the licence
reviewed by their own attorney. That has not been done here.

---

## Fraunces

The display typeface. Subset to the 89 characters the interface can show and
embedded in `fonts/fraunces.css` — see `tools/build_font.py`.

> Copyright 2018 The Fraunces Project Authors
> (https://github.com/undercasetype/Fraunces)
>
> This Font Software is licensed under the SIL Open Font License, Version 1.1.

The full licence text is in `fonts/OFL.txt`, which ships with the app as the
OFL requires. The OFL also requires that a modified version not use the reserved
font name; the subset here keeps the name Fraunces and changes no outlines — it
only removes glyphs and pins variable axes — so it is a subset, not a
derivative under a new name.

---

## Not used

**Peter Norvig's word-frequency files** were considered for level 3 and
rejected: the page grants an MIT licence over the code but says nothing about
the data, which derives from a Google corpus distributed by the Linguistic Data
Consortium. There is no clear permission to redistribute it, so it is not in
this app.
