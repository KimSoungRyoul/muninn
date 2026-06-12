// muninnDocs — Nextra 4 정적 문서 사이트.
// GitHub Pages(프로젝트 페이지)는 https://<owner>.github.io/muninn/ 하위에 서빙되므로
// CI 에서 NEXT_PUBLIC_BASE_PATH=/muninn 으로 빌드한다. 로컬 dev/QA 는 basePath 없음.
import nextra from 'nextra'

const withNextra = nextra({
  defaultShowCopyCode: true
})

export default withNextra({
  output: 'export',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  // 정적 export 는 Next 이미지 최적화 서버가 없다.
  images: { unoptimized: true }
})
