// The nine books: title, author, Wilson's blurb and quote, verbatim (SPEC 0.2
// for the five rewritten blurbs, SPEC 4.1 for the rest). The panel is built
// from this by bookPanel() in ./types unless a custom panel (kahneman,
// austen) is registered in src/panels. Order here is the shelf order
// (layout.bookSlots); it is not read for layout.
import type { BookContent } from './types';

export const books: BookContent[] = [
  {
    id: 'book.anna-karenina',
    title: 'Anna Karenina',
    author: 'Leo Tolstoy',
    blurb: 'Tolstoy wrote Anna Karenina amid a deepening spiritual crisis, and his troubles found their way into the lives of his characters. What holds a marriage together when love no longer does? Can we be guilty for feelings we never chose? What do we owe to others, and what part of ourselves must we surrender to repay it? You do not walk away from the book with these questions settled. You carry them into your own life, where a character you once judged begins to resemble someone you love, or, more unsettlingly, yourself.',
    quote: 'He knew she was a woman like any other, but he loved her, and therefore her failures were dear to him.',
  },
  {
    id: 'book.inferno',
    title: 'Inferno',
    author: 'Dante Alighieri',
    blurb: "Dante's virtual reality project. The first book that made me understand how words could stretch the limits of what we can imagine, and make us feel we had been there.",
    quote: 'Midway upon the journey of our life I found myself within a forest dark, for the straightforward pathway had been lost.',
    image: { src: '/forest.webp', alt: 'A traveller in a red robe at the edge of a dark forest' },
  },
  {
    id: 'book.becoming-steve-jobs',
    title: 'Becoming Steve Jobs',
    author: 'Brent Schlender and Rick Tetzeli',
    blurb: "Much better than Isaacson's, lol.",
  },
  {
    id: 'book.innovators-dilemma',
    title: "The Innovator's Dilemma",
    author: 'Clayton M. Christensen',
    blurb: "The tragedy of an incumbent is getting the right answer to the wrong question. So what's the right question? This book asks it, and gives you the right answer.",
  },
  {
    id: 'book.three-body',
    title: 'The Three-Body Problem',
    author: 'Liu Cixin',
    blurb: 'Wow, this book is so good. Some writers believe science limits fiction by ruling out things like magic and time travel. But science is what expands our imagination. Can you imagine how vast the universe is? Can you grasp how brief a Planck time, roughly 10⁻⁴³ seconds, is? What if a book helps you to experience these? Our imagination is bounded by our mortal senses, not science.',
  },
  {
    id: 'book.power-broker',
    title: 'The Power Broker',
    author: 'Robert A. Caro',
    blurb: 'Moses is truly a force of nature. Also read it if you are interested in architecture!',
  },
  {
    id: 'book.thinking-fast-slow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    blurb: 'Self-awareness for your visual and mental illusions.',
  },
  {
    id: 'book.demi-gods',
    title: '天龙八部',
    author: '金庸 (Jin Yong)',
    blurb: "I got caught by my mom reading Jin Yong's novels at 2 am. She let me keep reading, so I finished all 15 of his novels.",
  },
  {
    id: 'book.pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    blurb: "You might wonder what a 19th-century feminist novelist has to do with a guy from Hong Kong in the 21st century who's into tech. Welp. So much.",
  },
];

export const bookById: Record<string, BookContent> = Object.fromEntries(books.map((b) => [b.id, b]));
