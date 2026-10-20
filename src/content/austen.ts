// The Austen letter (SPEC 0.2): slides in over the Pride and Prejudice panel
// when the music stopped because the book was opened. Wilson's words,
// verbatim; the heading is the builder's (the theme note the spec asks for).
export const austen = {
  /** The short heading: letter writing is a theme in Austen's novels, so the theme is extended here. */
  heading: 'Letters carry the turns of every Austen novel: Darcy explains himself in one, Wentworth declares himself in another. So the reply to what just happened comes as a letter too.',
  salutation: 'Dear reader,',
  /** Paragraphs of the letter. `*Persuasion*` is set in italics by the panel. */
  body: [
    "So you noticed the music stopped when you opened this book. Well, this is not a glitch. Let me ask you a quick question: when you're overwhelmed by sadness, should you listen to sad music? The common answer is yes, because it's cathartic. But if music, instead of relieving our sadness, becomes a tool to deliberately produce it, is the emotion still yours? To live is indeed to feel, but does indulging one's sensibility lead to a loss of emotional ownership? If you want the right answer (in my opinion), read *Persuasion*.",
  ],
  signoff: 'Yours,',
  signature: 'Wilson',
  link: { text: 'read Persuasion', href: 'https://www.gutenberg.org/ebooks/105' },
};
