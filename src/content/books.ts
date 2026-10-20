// The nine books (SPEC 4.1): title, author, Wilson's blurb and quote, kept as
// written. The panel is built from this by bookPanel() in ./types unless a
// custom panel (kahneman, austen) is registered in src/panels.
import type { BookContent } from './types';

export const books: BookContent[] = [
  {
    id: 'book.anna-karenina',
    title: 'Anna Karenina',
    author: 'Leo Tolstoy',
    blurb: "Tolstoy has a way of capturing the human psyche. Also: life happens. Don't take it too seriously.",
    quote: 'He knew she was a woman like any other, but he loved her, and therefore her failures were dear to him.',
  },
  {
    id: 'book.inferno',
    title: 'Inferno',
    author: 'Dante Alighieri',
    blurb: "Dante's virtual reality project, with nothing but words.",
    quote: 'Midway upon the journey of our life I found myself within a forest dark, for the straightforward pathway had been lost.',
    image: { src: '/forest.webp', alt: 'A traveller in a red robe at the edge of a dark forest' },
  },
  {
    id: 'book.three-body',
    title: 'The Three-Body Problem',
    author: 'Liu Cixin',
    blurb: "After reading this I felt like I was floating in the liminal space between time and space, detached from my surroundings. Wow. It's so good.",
  },
  {
    id: 'book.power-broker',
    title: 'The Power Broker',
    author: 'Robert A. Caro',
    blurb: 'What a force of nature looks like.',
  },
  {
    id: 'book.pride-and-prejudice',
    title: 'Pride and Prejudice',
    author: 'Jane Austen',
    blurb: "You might wonder what a 19th-century feminist novelist has to do with a guy from Hong Kong in the 21st century who's into tech. Welp. So much.",
  },
  {
    id: 'book.thinking-fast-slow',
    title: 'Thinking, Fast and Slow',
    author: 'Daniel Kahneman',
    blurb: 'Self-awareness for your visual and mental illusions.',
  },
  {
    id: 'book.innovators-dilemma',
    title: "The Innovator's Dilemma",
    author: 'Clayton M. Christensen',
    blurb: "The tragedy of an incumbent is getting the right answer to the wrong question. So what's the right question? This book asks it, and gives you the right answer.",
  },
  {
    id: 'book.demi-gods',
    title: '天龙八部',
    author: '金庸 (Jin Yong)',
    blurb: "I got caught by my mom reading Jin Yong's novels at 2 am. She let me keep reading.",
  },
  {
    id: 'book.becoming-steve-jobs',
    title: 'Becoming Steve Jobs',
    author: 'Brent Schlender and Rick Tetzeli',
    blurb: "Much better than Isaacson's, lol.",
  },
];

export const bookById: Record<string, BookContent> = Object.fromEntries(books.map((b) => [b.id, b]));
