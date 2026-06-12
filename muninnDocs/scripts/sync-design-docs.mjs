// docs/design/*.md(권위 스펙, single source of truth)를 content/design/*.mdx 로 동기화한다.
// 원본은 절대 수정하지 않는다 — 사이트 빌드 산출물(content/design/)은 gitignore 대상.
//
// 변환 규칙:
//   - README.md → index.mdx, 그 외 <name>.md → <name>.mdx
//   - 설계 문서 간 상대 링크(./foo.md) → 사이트 내부 경로(/design/foo) — Next Link 가 basePath 를 처리
//   - 저장소 내 다른 파일 링크(../../*, ./examples/*.yaml 등) → GitHub blob URL
//   - 이미지 임베드(![]())는 content/design/ 으로 복사 후 상대 경로 참조(Nextra 정적 임포트)
//   - 각 페이지 상단에 "동기화된 사본" 안내 추가
// 코드 펜스(``` / ~~~) 내부와 인라인 코드(`...`)는 변환하지 않는다.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const srcDir = path.join(repoRoot, 'docs', 'design')
const outDir = path.join(repoRoot, 'muninnDocs', 'content', 'design')

const GITHUB_BLOB_BASE = 'https://github.com/KimSoungRyoul/muninn/blob/main/'
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'])

// 사이드바 제목(없는 파일은 파일명 그대로 노출).
const SIDEBAR_TITLES = {
  index: '개요',
  'muninn-devops-agent-platform': '플랫폼 설계 (메인 스펙)',
  'operator-design': '오퍼레이터 설계',
  'muninn-goal-conversational-delegation': '대화형 위임 (/goal)',
  'muninn-a2a-integration': 'A2A 통합'
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

// 큐레이션 페이지(index/architecture)가 쓰는 공용 에셋 — 루트 PNG 가 원본.
// ⚠️ content/ 하위에 페이지(md/mdx) 없는 폴더를 만들면 Nextra pageMap 의
// children 검증(zod)이 깨져 모든 페이지가 500 이 된다 — content 루트에 파일로 둔다.
copyFileSync(
  path.join(repoRoot, 'muninnAgentPlatform_architecture.png'),
  path.join(repoRoot, 'muninnDocs', 'content', 'muninn-architecture.png')
)

const sourceFiles = readdirSync(srcDir).filter(f => f.endsWith('.md'))
const copiedAssets = new Set()

/** docs/design/ 기준 상대 URL 하나를 사이트에 맞게 변환한다. */
function rewriteUrl(url, { isImage }) {
  if (/^(https?:|mailto:|#)/.test(url)) return url
  const [pathname, fragment = ''] = url.split('#')
  const hash = fragment ? `#${fragment}` : ''
  const repoPath = path.posix.normalize(path.posix.join('docs/design', pathname))

  // 설계 문서 간 링크 → 사이트 내부 경로
  const inDesign = /^docs\/design\/([^/]+)\.md$/.exec(repoPath)
  if (inDesign) {
    const name = inDesign[1]
    return name === 'README' ? `/design${hash}` : `/design/${name}${hash}`
  }

  // 이미지 임베드 → content/design/ 으로 복사 후 상대 참조
  if (isImage && IMAGE_EXTS.has(path.posix.extname(repoPath).toLowerCase())) {
    const abs = path.join(repoRoot, repoPath)
    const basename = path.basename(repoPath)
    if (!copiedAssets.has(basename)) {
      copyFileSync(abs, path.join(outDir, basename))
      copiedAssets.add(basename)
    }
    return `./${basename}`
  }

  // 그 외 저장소 경로 → GitHub. 디렉토리는 tree, 파일은 blob.
  let isDir = false
  try {
    isDir = statSync(path.join(repoRoot, repoPath)).isDirectory()
  } catch {
    // 원본에 존재하지 않는 경로면 blob 으로 두고 GitHub 의 404 페이지에 맡긴다.
  }
  const base = isDir ? GITHUB_BLOB_BASE.replace('/blob/', '/tree/') : GITHUB_BLOB_BASE
  return `${base}${repoPath}${hash}`
}

/** 한 줄에서 인라인 코드 스팬(`...`)의 [시작, 끝) 범위 목록을 구한다. */
function codeSpanRanges(line) {
  const ranges = []
  const re = /`[^`]*`/g
  let m
  while ((m = re.exec(line)) !== null) ranges.push([m.index, m.index + m[0].length])
  return ranges
}

/**
 * 코드 펜스/인라인 코드를 보존하면서 마크다운 링크·이미지 URL 을 변환한다.
 * 링크 텍스트가 인라인 코드인 형태([`x`](url))도 변환 대상 — 링크가 코드 스팬
 * "내부에서 시작"하는 경우(`[x](y)` 전체가 코드)만 보존한다.
 */
function rewriteLinks(markdown) {
  const lines = markdown.split('\n')
  let inFence = false
  return lines
    .map(line => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence
        return line
      }
      if (inFence) return line
      const spans = codeSpanRanges(line)
      const insideCode = i => spans.some(([s, e]) => i > s && i < e)
      return line.replace(
        /(!?)\[((?:`[^`]*`|[^\]`])*)\]\(([^()\s]+)\)/g,
        (full, bang, text, url, offset) =>
          insideCode(offset)
            ? full
            : `${bang}[${text}](${rewriteUrl(url, { isImage: bang === '!' })})`
      )
    })
    .join('\n')
}

for (const file of sourceFiles) {
  const name = file === 'README.md' ? 'index' : file.replace(/\.md$/, '')
  const raw = readFileSync(path.join(srcDir, file), 'utf8')
  const body = rewriteLinks(raw)
  const notice =
    `> [!NOTE]\n` +
    `>\n` +
    `> 이 페이지는 [\`docs/design/${file}\`](${GITHUB_BLOB_BASE}docs/design/${file})에서 빌드 시 동기화된 사본입니다. 수정은 원본 파일에서 해주세요.\n`
  writeFileSync(path.join(outDir, `${name}.mdx`), `${notice}\n${body}`)
}

// 사이드바 순서/제목 — SIDEBAR_TITLES 순서를 따르고, 나머지는 뒤에 붙인다.
const names = sourceFiles.map(f => (f === 'README.md' ? 'index' : f.replace(/\.md$/, '')))
const ordered = [
  ...Object.keys(SIDEBAR_TITLES).filter(n => names.includes(n)),
  ...names.filter(n => !(n in SIDEBAR_TITLES)).sort()
]
const metaEntries = ordered
  .map(n => `  ${JSON.stringify(n)}: ${JSON.stringify(SIDEBAR_TITLES[n] ?? n)}`)
  .join(',\n')
writeFileSync(path.join(outDir, '_meta.ts'), `export default {\n${metaEntries}\n}\n`)

console.log(`[sync-design-docs] ${sourceFiles.length} docs + ${copiedAssets.size} assets → content/design/`)
