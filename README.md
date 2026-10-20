# Wilson's table

A desk, late at night, with the things of Wilson's life on it. One 3D scene
(three.js), no pages. SPEC.md is the contract; docs/OBJECT-GUIDE.md is how an
object builder adds a thing to the table; docs/QA.md is the bar.

```
npm install
npm run dev        # http://localhost:5180
npm run worker     # the API on 8780 (wrangler dev --local, D1 in .wrangler/)
npm run build      # type-check + dist/
npm run qa         # scripted visits on desktop + iPhone, reduced motion, timing, deep link
npm run shots -- http://localhost:5180/ shots/x --viewport iphone --focus jar
```

Images come from `npm run images` (sources outside the repo; output is committed).
Deployment of the Worker is the owner's step: see worker/README.md.
