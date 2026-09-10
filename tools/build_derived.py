#!/usr/bin/env python3
"""Build the two derived data files that need outside sources.

Output: data/tiers.js       - WT_COMMON, the ordinary-English words by length
        data/defs_auto.js   - WT_DEFS_AUTO, machine-sourced definitions

Sources (downloaded into tools/vendor/ on first run):
  SCOWL    - permissively licensed word lists graded by how many of twelve
             dictionaries a word appears in. Used for "is this an ordinary
             English word or a game-only word?"
  WordNet  - permissively licensed glosses. Used for definitions.

The rule that makes automatic definitions safe:

    Only take a gloss when the word is in SCOWL tier 60 or below.

Short game words are the failure case. WordNet's first sense for AA is "an
associate degree in arts"; for AB it is a blood group. Those words are NOT in
SCOWL's ordinary-English tiers, so they are skipped here and hand-authored in
data/definitions.js instead. For a word that IS ordinary English - ACE, ADO,
AWE - the first sense is the sense a player wants. Hand-authored definitions
always win over anything generated here.
"""

import json
import os
import re
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
VENDOR = os.path.join(HERE, "vendor")

SCOWL_TIERS = [10, 20, 35, 40, 50, 55, 60, 70]
SCOWL_URL = "https://raw.githubusercontent.com/deepin-community/scowl/master/final/english-words.{}"
WORDNET_URL = "https://raw.githubusercontent.com/nltk/nltk_data/gh-pages/packages/corpora/wordnet.zip"

# A word must be in a SCOWL tier at or below this to get an automatic gloss.
TRUST_TIER = 60
# The tier that defines "common" for level 3.
COMMON_TIER = 35
# Tiers used to pick a recognisable six-letter name for a bingo stem. Two of
# them, because a stem needs *a* memorable name more than a perfect one: AEINST
# is universally remembered as TISANE, a word ordinary enough for no small tier.
NAME_TIER = 50
NAME_TIER_WIDE = 70
MAX_GLOSS = 110


def fetch():
    os.makedirs(VENDOR, exist_ok=True)
    for n in SCOWL_TIERS:
        p = os.path.join(VENDOR, f"scowl.{n}")
        if not os.path.exists(p):
            print(f"  downloading SCOWL tier {n}")
            urllib.request.urlretrieve(SCOWL_URL.format(n), p)
    wn = os.path.join(VENDOR, "wordnet")
    if not os.path.isdir(wn):
        z = os.path.join(VENDOR, "wordnet.zip")
        print("  downloading WordNet")
        urllib.request.urlretrieve(WORDNET_URL, z)
        with zipfile.ZipFile(z) as zf:
            zf.extractall(VENDOR)
    return wn


def load_scowl():
    """Cumulative tiers: tier[n] is every word at level n or below."""
    tiers = {}
    cum = set()
    for n in SCOWL_TIERS:
        with open(os.path.join(VENDOR, f"scowl.{n}"), encoding="latin-1") as fh:
            cum |= {
                w.strip().lower()
                for w in fh
                if w.strip().isalpha() and w.strip().isascii()
            }
        tiers[n] = set(cum)
    return tiers


def load_wordnet(root):
    """lemma -> (part of speech, first gloss). First sense only, on purpose."""
    d = os.path.join(root, "wordnet")
    if not os.path.isdir(d):
        d = root
    out = {}
    for fname, tag in [
        ("data.noun", "noun"),
        ("data.verb", "verb"),
        ("data.adj", "adj"),
        ("data.adv", "adv"),
    ]:
        with open(os.path.join(d, fname), encoding="latin-1") as fh:
            for line in fh:
                if line.startswith("  "):
                    continue
                left, _, gloss = line.partition("|")
                parts = left.split()
                try:
                    n = int(parts[3], 16)
                except (IndexError, ValueError):
                    continue
                g = gloss.strip().split(";")[0].strip()
                if not g:
                    continue
                for i in range(n):
                    lemma = parts[4 + 2 * i].lower().split("(")[0]
                    out.setdefault(lemma, (tag, g))
    return out


def tidy(gloss):
    """WordNet glosses are written for lexicographers. Trim to something a
    player can read at a glance without changing what it says."""
    g = re.sub(r"\s+", " ", gloss).strip()
    g = re.sub(r'^\(([^)]{1,24})\)\s*', r"\1: ", g)  # "(botany) x" -> "botany: x"
    if len(g) > MAX_GLOSS:
        cut = g[:MAX_GLOSS]
        for sep in [", ", " - ", " ("]:
            i = cut.rfind(sep)
            if i > MAX_GLOSS * 0.55:
                cut = cut[:i]
                break
        else:
            i = cut.rfind(" ")
            cut = cut[:i] if i > 0 else cut
        g = cut.rstrip(" ,;:-") + "…"
    return g


def lexicon_words():
    raw = {w.strip() for w in open(os.path.join(HERE, "enable1.txt")) if w.strip()}
    supp = json.load(open(os.path.join(HERE, "supplement.json"), encoding="utf-8"))
    return raw | set(supp["add"]["twos"]) | set(supp["add"]["threes"])


def write_js(path, header, body):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(header + body)
    print(f"wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")


def main():
    print("sources")
    wn_root = fetch()
    tiers = load_scowl()
    glosses = load_wordnet(wn_root)
    words = lexicon_words()
    print(f"  SCOWL tier<={COMMON_TIER}: {len(tiers[COMMON_TIER])} words")
    print(f"  WordNet lemmas         : {len(glosses)}")

    # --- tiers.js -----------------------------------------------------
    common = {}
    for n in range(3, 9):
        at_len = sorted(w for w in words if len(w) == n)
        common[str(n)] = "".join(w for w in at_len if w in tiers[COMMON_TIER])
        print(f"  common {n}-letter: {len(common[str(n)]) // n:>5} of {len(at_len)}")
    # Six-letter words one tier looser, used only to name bingo stems: AEINST is
    # universally remembered as TISANE, a word too uncommon for the tight tier.
    sixes = sorted(w for w in words if len(w) == 6)
    known6 = [
        w for w in sixes if w in tiers[NAME_TIER_WIDE] and w not in tiers[NAME_TIER]
    ]
    print(f"  stem-name sixes  : {len(known6)} more")

    write_js(
        os.path.join(ROOT, "data", "tiers.js"),
        "/* Generated by tools/build_derived.py - do not edit by hand.\n"
        "   Words that are ordinary English rather than game-only vocabulary.\n"
        "\n"
        f"   WT_COMMON   - by length, 3 to 8: the words in SCOWL size {COMMON_TIER} or below.\n"
        "                 Level 3 uses the threes; the anagram drill uses the rest,\n"
        "                 because scrambling a word nobody knows is not a puzzle.\n"
        f"   WT_KNOWN6   - six-letter words between size {NAME_TIER} and {NAME_TIER_WIDE}, used\n"
        "                 only to name bingo stems.\n"
        "\n"
        "   SCOWL grades a word by how many of twelve dictionaries carry it, seeded\n"
        "   from frequency lists; size 35 is its recommended 'small' list. This is a\n"
        "   commonness signal, not a raw frequency count - see PROVENANCE.md.\n"
        "\n"
        "   Each value is every word of that length concatenated, no separators.\n"
        "\n"
        "   SCOWL is Copyright 2000-2018 by Kevin Atkinson and others; see\n"
        "   LICENSES.md for the full notice its licence requires us to carry. */\n"
        "var WT_COMMON = "
        + json.dumps(common, separators=(",", ":"))
        + ";\nvar WT_KNOWN6 = ",
        json.dumps("".join(known6), separators=(",", ":")) + ";\n",
    )

    # --- defs_auto.js -------------------------------------------------
    trusted = tiers[TRUST_TIER]
    auto = {}
    skipped_untrusted = 0
    # Only what the app actually displays. Levels use 2-5 letter words, so those
    # get the full trusted tier. The anagram drill goes up to seven, but only
    # ever shows words from WT_COMMON, so 6 and 7 use the tighter tier - that
    # keeps the payload to a third of what the whole range would cost.
    # Q-without-U runs longer still, but WordNet covers none of it anyway.
    for w in sorted(words):
        if not (2 <= len(w) <= 7):
            continue
        if w not in glosses:
            continue
        tier_for_length = trusted if len(w) <= 5 else tiers[COMMON_TIER]
        if w not in tier_for_length:
            skipped_untrusted += 1
            continue
        tag, g = glosses[w]
        auto[w] = [tag, tidy(g)]
    print(f"auto glosses  : {len(auto)}")
    print(f"  skipped (in WordNet but not ordinary English): {skipped_untrusted}")

    write_js(
        os.path.join(ROOT, "data", "defs_auto.js"),
        "/* Generated by tools/build_derived.py - do not edit by hand.\n"
        "   WordNet's first sense, for words ordinary enough that the first sense is\n"
        "   the right one. A word only appears here if it is in SCOWL size "
        f"{TRUST_TIER}\n"
        "   or below; game-only words are deliberately absent, because WordNet ranks\n"
        "   the wrong sense first for them. data/definitions.js overrides this file.\n"
        "\n"
        "   WordNet 3.0 Copyright 2006 by Princeton University. All rights reserved.\n"
        "   See LICENSES.md for the full notice. */\n"
        "var WT_DEFS_AUTO = ",
        json.dumps(auto, separators=(",", ":"), ensure_ascii=False) + ";\n",
    )


if __name__ == "__main__":
    main()
