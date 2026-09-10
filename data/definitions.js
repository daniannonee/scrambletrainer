/* Definitions for the words used in the guided path.
 *
 * HAND-AUTHORED, NOT EXTRACTED. See PROVENANCE.md for why: every public-domain
 * dictionary dataset we tested ranks the *wrong* sense first for short game
 * words (WordNet's top gloss for AA is "an associate degree in arts", for AB
 * it's a blood group, for AL it's the state of Alabama). Shipping an automated
 * extract would mean shipping confidently wrong definitions.
 *
 * These are written in plain language from scratch, checked against WordNet 3.0
 * and Webster's Unabridged 1913 (both freely redistributable) as factual
 * references. The nineteen words from tools/supplement.json were checked against
 * the NWL2023 sources cited in that file instead.
 *
 * Shape: WORD: [part of speech, definition]
 * Words listed in WT_DEFS_UNVERIFIED at the bottom want a second opinion.
 */

var WT_DEFS = {
  aa: ["noun", "rough, crumbly lava with a jagged surface"],
  ab: ["noun", "an abdominal muscle"],
  ad: ["noun", "an advertisement"],
  ae: ["adj", "one — the Scots form of “a”"],
  ag: ["noun", "agriculture"],
  ah: ["verb", "to say “ah”, as in delight or surprise"],
  ai: ["noun", "the three-toed sloth of South America"],
  al: ["noun", "an East Indian shrub grown for a red dye"],
  am: ["verb", "the form of “be” that goes with “I”"],
  an: ["article", "the form of “a” used before a vowel sound"],
  ar: ["noun", "the letter R"],
  as: ["noun", "an ancient Roman coin"],
  at: ["noun", "a unit of money in Laos"],
  aw: ["interj", "used to express protest, sympathy, or mild disappointment"],
  ax: ["verb", "to chop or cut with an axe"],
  ay: ["noun", "a vote in favour of something"],
  ba: ["noun", "in ancient Egyptian belief, the soul that outlives the body"],
  be: ["verb", "to exist"],
  bi: ["noun", "a bisexual person"],
  bo: ["noun", "a pal or buddy"],
  by: ["noun", "an advance to the next round without playing, in a tournament"],
  da: ["noun", "dad — chiefly British"],
  de: ["prep", "of, or from — used in names"],
  do: ["verb", "to carry out or perform"],
  ed: ["noun", "education, as a field of study"],
  ef: ["noun", "the letter F"],
  eh: ["interj", "used to ask for something to be repeated, or to invite agreement"],
  el: ["noun", "an elevated railway"],
  em: ["noun", "in printing, a width equal to the type size — the width of a capital M"],
  en: ["noun", "in printing, half the width of an em"],
  er: ["interj", "used to fill a pause while thinking"],
  es: ["noun", "the letter S"],
  et: ["verb", "a dialect past tense of “eat”"],
  ew: ["interj", "used to express disgust"],
  ex: ["noun", "the letter X"],
  fa: ["noun", "the fourth note of a major scale"],
  fe: ["noun", "a Hebrew letter — a variant of pe"],
  gi: ["noun", "the white jacket and trousers worn in judo and other martial arts"],
  go: ["verb", "to move from one place to another"],
  ha: ["interj", "used to express surprise, triumph, or amusement"],
  he: ["pron", "the male person already mentioned"],
  hi: ["interj", "used as a greeting"],
  hm: ["interj", "used to express thoughtful hesitation"],
  ho: ["interj", "used to call attention or express surprise"],
  id: ["noun", "in Freud's model of the mind, the part driven by instinct"],
  "if": ["noun", "an uncertainty or condition, as in “no ifs about it”"],
  "in": ["noun", "a position of influence or favour"],
  is: ["verb", "the form of “be” that goes with “he”, “she”, or “it”"],
  it: ["noun", "in a children's game, the player who must catch the others"],
  jo: ["noun", "a sweetheart — Scots"],
  ka: ["noun", "in ancient Egyptian belief, a person's spiritual double"],
  ki: ["noun", "life energy — the Japanese name for qi"],
  la: ["noun", "the sixth note of a major scale"],
  li: ["noun", "a Chinese unit of distance, about a third of a mile"],
  lo: ["interj", "used to draw attention to something — look, see"],
  ma: ["noun", "mother"],
  me: ["pron", "the object form of “I”"],
  mi: ["noun", "the third note of a major scale"],
  mm: ["interj", "used to express agreement or pleasure"],
  mo: ["noun", "a moment"],
  mu: ["noun", "the twelfth letter of the Greek alphabet"],
  my: ["adj", "belonging to me"],
  na: ["adv", "no, or not — Scots"],
  ne: ["adj", "born with the name of — the form of “née” used of a man"],
  no: ["noun", "a refusal or a negative vote"],
  nu: ["noun", "the thirteenth letter of the Greek alphabet"],
  od: ["noun", "a force once thought to underlie magnetism and other phenomena"],
  oe: ["noun", "a whirlwind off the Faroe Islands"],
  of: ["prep", "belonging to, or coming from"],
  oh: ["verb", "to say “oh”, as in surprise"],
  oi: ["interj", "used to express dismay, or to call out to someone"],
  ok: ["adj", "all right"],
  om: ["noun", "a sacred syllable chanted in Hindu and Buddhist practice"],
  on: ["noun", "in cricket, the side of the field the batter faces"],
  op: ["noun", "abstract art built on optical illusion"],
  or: ["noun", "gold, as a colour in heraldry"],
  os: ["noun", "a bone"],
  ow: ["interj", "used to express sudden pain"],
  ox: ["noun", "an adult castrated bull, kept for work"],
  oy: ["interj", "used to express dismay or exasperation"],
  pa: ["noun", "father"],
  pe: ["noun", "the seventeenth letter of the Hebrew alphabet"],
  pi: ["noun", "the sixteenth letter of the Greek alphabet"],
  po: ["noun", "a chamber pot"],
  qi: ["noun", "the vital energy of Chinese philosophy and medicine"],
  re: ["noun", "the second note of a major scale"],
  sh: ["interj", "used to call for silence"],
  si: ["noun", "the seventh note of a major scale — an older name for ti"],
  so: ["noun", "the fifth note of a major scale"],
  ta: ["interj", "thanks — chiefly British"],
  te: ["noun", "the seventh note of a major scale — a variant of ti"],
  ti: ["noun", "the seventh note of a major scale"],
  to: ["prep", "in the direction of"],
  uh: ["interj", "used to fill a pause while thinking"],
  um: ["interj", "used to fill a pause while thinking"],
  un: ["noun", "one — as in “a good un”"],
  up: ["verb", "to raise or increase"],
  us: ["pron", "the object form of “we”"],
  ut: ["noun", "the note C — the older name for do"],
  we: ["pron", "the speaker together with others"],
  wo: ["noun", "woe — an older spelling"],
  xi: ["noun", "the fourteenth letter of the Greek alphabet"],
  xu: ["noun", "a former unit of money in Vietnam"],
  ya: ["pron", "you — informal"],
  ye: ["pron", "you — an old plural form"],
  yo: ["interj", "used to call attention or greet someone"],
  za: ["noun", "pizza"],

  /* Three-letter plurals of the supplemented twos. Added with them so the
     study screen can show what those words grow into. */
  das: ["noun", "plural of da"],
  fes: ["noun", "plural of fe"],
  gis: ["noun", "plural of gi"],
  kis: ["noun", "plural of ki"],
  pos: ["noun", "plural of po"],
  qis: ["noun", "plural of qi"],
  tes: ["noun", "plural of te"],
  zas: ["noun", "plural of za"],

  /* Q without U (level 5). WordNet and Webster cover none of these — they are
     game vocabulary almost to a word — so they are all hand-authored. */
  buqsha: ["noun", "a former unit of money in Yemen"],
  buqshas: ["noun", "plural of buqsha"],
  faqir: ["noun", "a Muslim or Hindu holy man living on alms — also fakir"],
  faqirs: ["noun", "plural of faqir"],
  qaid: ["noun", "a North African chief or local governor — also caid"],
  qaids: ["noun", "plural of qaid"],
  qanat: ["noun", "an underground channel that carries irrigation water, used in Iran"],
  qanats: ["noun", "plural of qanat"],
  qat: ["noun", "a shrub whose leaves are chewed as a stimulant — also khat"],
  qats: ["noun", "plural of qat"],
  qindar: ["noun", "a former unit of money in Albania"],
  qindars: ["noun", "plural of qindar"],
  qindarka: ["noun", "a plural of qindar"],
  qintar: ["noun", "a unit of money in Albania, one hundredth of a lek"],
  qintars: ["noun", "plural of qintar"],
  qiviut: ["noun", "the soft wool of the musk ox"],
  qiviuts: ["noun", "plural of qiviut"],
  qoph: ["noun", "the nineteenth letter of the Hebrew alphabet"],
  qophs: ["noun", "plural of qoph"],
  qwerty: ["noun", "the standard English-language keyboard layout"],
  qwertys: ["noun", "plural of qwerty"],
  sheqel: ["noun", "the main unit of money in Israel"],
  sheqalim: ["noun", "a plural of sheqel"],
  suq: ["noun", "an open-air market in an Arab city — also souk"],
  suqs: ["noun", "plural of suq"],
  tranq: ["noun", "a tranquilizer"],
  tranqs: ["noun", "plural of tranq"],
  umiaq: ["noun", "an open Inuit boat covered with skins — also umiak"],
  umiaqs: ["noun", "plural of umiaq"]
};

/* Words whose definition is worth a second opinion before release: the sense is
   real but unusual enough that it should be confirmed against a current
   dictionary. tools/test.js checks this list stays honest (every entry must
   exist in WT_DEFS). */
var WT_DEFS_UNVERIFIED = [
  "al", "et", "ne", "od", "oe", "on", "si", "un", "ut",
  // Q-without-U: the currency and title words especially — several are
  // transliterations with variant spellings and I would want them checked.
  "buqsha", "qaid", "qindar", "qindarka", "qintar", "sheqalim"
];
