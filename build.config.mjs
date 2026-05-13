import * as esbuild from 'esbuild'
import { readdirSync } from 'fs'
import { execSync } from 'child_process'

const dev = process.argv.includes('--watch')
const OUT = process.env.HH_OUT_DIR || 'dist'

const coreEntry = ['src/_hyperherald.js']
const extEntries = [
  'src/ext/morph.js',
]

const shared = {
  bundle: true,
  sourcemap: true,
  platform: 'browser',
  target: 'es2022',
}

function builds(entryPoints, outOptions) {
  return [
    {
      ...shared,
      format: 'iife',
      entryPoints,
      ...outOptions.iife,
    },
    {
      ...shared,
      format: 'esm',
      entryPoints,
      ...outOptions.esm,
    },
    {
      ...shared,
      format: 'iife',
      minify: true,
      sourcemap: false,
      entryPoints,
      ...outOptions.iifeMin,
    },
    {
      ...shared,
      format: 'esm',
      minify: true,
      sourcemap: false,
      entryPoints,
      ...outOptions.esmMin,
    },
  ]
}

const coreBuildConfigs = builds(coreEntry, {
  iife:    { outfile: `${OUT}/_hyperherald.js` },
  esm:     { outfile: `${OUT}/_hyperherald.esm.js` },
  iifeMin: { outfile: `${OUT}/_hyperherald.min.js` },
  esmMin:  { outfile: `${OUT}/_hyperherald.esm.min.js` },
})

const extBuildConfigs = builds(extEntries, {
  iife:    { outdir: `${OUT}/ext` },
  esm:     { outdir: `${OUT}/ext`, outExtension: { '.js': '.esm.js' } },
  iifeMin: { outdir: `${OUT}/ext`, outExtension: { '.js': '.min.js' } },
  esmMin:  { outdir: `${OUT}/ext`, outExtension: { '.js': '.esm.min.js' } },
})

function brotliCompress() {
  const minFiles = [
    `${OUT}/_hyperherald.min.js`,
    `${OUT}/_hyperherald.esm.min.js`,
  ]
  try {
    for (const f of readdirSync(`${OUT}/ext`)) {
      if (f.endsWith('.min.js')) {
        minFiles.push(`${OUT}/ext/` + f)
      }
    }
  } catch {}
  for (const f of minFiles) {
    try { execSync(`brotli -f ${f}`) } catch (e) {
      console.warn(`brotli skipped for ${f}: ${e.message}`)
    }
  }
}

if (dev) {
  const ctx = await esbuild.context({
    ...shared,
    format: 'iife',
    entryPoints: coreEntry,
    outfile: `${OUT}/_hyperherald.js`,
  })
  await ctx.watch()
  console.log(`Watching src/ for changes...`)
} else {
  const allConfigs = [...coreBuildConfigs, ...extBuildConfigs]
  await Promise.all(allConfigs.map(c => esbuild.build(c)))
  brotliCompress()
  console.log(`Built ${OUT}/`)
}
