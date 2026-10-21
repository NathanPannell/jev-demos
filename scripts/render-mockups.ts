// Renders the design-audit sample screenshots into public/samples/audit/.
// Each variant breaks exactly one rule from src/data/audit.ts in one area; "clean" breaks none.
// Run: node scripts/render-mockups.ts
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

interface Variant {
  heading: string
  intro: string
  fields: string
  actions: string
  extraCss?: string
}

const base: Variant = {
  heading: 'Good morning, Sam',
  intro:
    'Three of your plants need water today. Your monstera has grown 4 cm this month, and the fern by the window could use more light.',
  fields: `
    <label class="field"><span>Plant name</span><input value="Monstera" /></label>
    <label class="field"><span>Water every</span><input value="7 days" /></label>`,
  actions: `<button class="primary">Save schedule</button><button class="ghost">Cancel</button>`,
}

const variants: Record<string, Variant> = {
  clean: base,
  contrast: {
    ...base,
    extraCss: '.intro { color: #d9dcd6 !important; }',
  },
  primaries: {
    ...base,
    heading: 'Checkout',
    intro: 'Review your order of 3 plants and a ceramic pot. Delivery is free over $40.',
    fields: `
      <label class="field"><span>Card number</span><input value="4242 4242 4242 4242" /></label>
      <label class="field"><span>Postcode</span><input value="V8W 1P6" /></label>`,
    actions: `<button class="primary">Pay $64.00</button><button class="primary">Pay with Wallet</button>`,
  },
  fonts: {
    ...base,
    heading: 'The Weekly Leaf',
    intro:
      'Our newsletter for houseplant people. This week: repotting without tears, and why your calathea is sulking.',
    fields: `
      <label class="field"><span>Email</span><input value="sam@example.com" /></label>
      <label class="field"><span>Frequency</span><input value="Weekly" /></label>`,
    actions: `<button class="primary">Subscribe</button><button class="ghost">No thanks</button>`,
    extraCss: `
      h1 { font-family: 'Comic Sans MS', 'Comic Neue', cursive !important; }
      .intro { font-family: 'Brush Script MT', 'Segoe Script', cursive !important; font-size: 24px !important; }
      .eyebrow { font-family: 'Courier New', monospace !important; }
      .stat b { font-family: Impact, 'Arial Black', sans-serif !important; }`,
  },
  labels: {
    ...base,
    heading: 'Create your account',
    intro: 'Join 20,000 plant parents. We will remind you when it is time to water.',
    fields: `
      <label class="field"><input placeholder="Full name" /></label>
      <label class="field"><input placeholder="Email address" /></label>
      <label class="field"><input placeholder="Password" type="password" /></label>`,
    actions: `<button class="primary">Create account</button><button class="ghost">I have an account</button>`,
  },
}

function page(v: Variant): string {
  return `<!doctype html><html><head><style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #f4f6f1; color: #1d2a1f; }
  .app { display: grid; grid-template-columns: 200px 1fr; height: 640px; }
  nav { background: #1f3b2a; color: #e8f2ea; padding: 24px 16px; }
  nav .logo { font-weight: 700; font-size: 20px; margin-bottom: 32px; }
  nav a { display: block; color: #cfe3d4; text-decoration: none; padding: 12px 8px; border-radius: 8px; font-size: 15px; }
  nav a.on { background: #2e5a3f; color: #fff; }
  main { padding: 40px 48px; }
  .eyebrow { font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #4c6b55; font-weight: 600; }
  h1 { margin: 8px 0 16px; font-size: 32px; }
  .intro { font-size: 17px; line-height: 1.5; color: #3a4a3d; max-width: 560px; margin: 0 0 24px; }
  .stats { display: flex; gap: 16px; margin-bottom: 24px; }
  .stat { background: #fff; border-radius: 12px; padding: 16px; width: 160px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  .stat b { display: block; font-size: 24px; }
  .stat span { font-size: 14px; color: #4c6b55; }
  form { background: #fff; border-radius: 12px; padding: 24px; max-width: 560px; box-shadow: 0 1px 2px rgba(0,0,0,.06); }
  .field { display: block; margin-bottom: 16px; }
  .field span { display: block; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
  .field input { width: 100%; height: 48px; border: 1px solid #b9c7bc; border-radius: 8px; padding: 0 16px; font-size: 16px; font-family: inherit; }
  .actions { display: flex; gap: 16px; margin-top: 8px; }
  button { height: 48px; padding: 0 24px; border-radius: 8px; font-size: 16px; font-weight: 600; font-family: inherit; cursor: pointer; }
  .primary { background: #2f8f4e; color: #fff; border: 0; }
  .ghost { background: transparent; color: #2f6b42; border: 1px solid #9fb8a5; }
  ${v.extraCss ?? ''}
  </style></head><body><div class="app">
  <nav><div class="logo">Fernly</div><a class="on" href="#">Home</a><a href="#">My plants</a><a href="#">Calendar</a><a href="#">Settings</a></nav>
  <main>
    <div class="eyebrow">Tuesday</div>
    <h1>${v.heading}</h1>
    <p class="intro">${v.intro}</p>
    <div class="stats"><div class="stat"><b>12</b><span>plants</span></div><div class="stat"><b>3</b><span>need water</span></div><div class="stat"><b>94%</b><span>on schedule</span></div></div>
    <form onsubmit="return false">${v.fields}<div class="actions">${v.actions}</div></form>
  </main></div></body></html>`
}

const outDir = 'public/samples/audit'
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 960, height: 640 },
  deviceScaleFactor: 1,
})
const tab = await context.newPage()
for (const [name, variant] of Object.entries(variants)) {
  await tab.setContent(page(variant))
  await tab.screenshot({ path: `${outDir}/${name}.png` })
  console.log(`rendered ${outDir}/${name}.png`)
}
await browser.close()
