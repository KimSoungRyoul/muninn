import { generateStaticParamsFor, importPage } from 'nextra/pages'
import { useMDXComponents as getMDXComponents } from '../../mdx-components'

export const generateStaticParams = generateStaticParamsFor('mdxPath')

type PageProps = Readonly<{
  params: Promise<{ mdxPath?: string[] }>
}>

export async function generateMetadata(props: PageProps) {
  const params = await props.params
  const { metadata } = await importPage(params.mdxPath)
  return metadata
}

const Wrapper = getMDXComponents().wrapper

// content/design/ 은 docs/design/ 의 빌드 시 사본(gitignore)이라, 테마가 filePath 로 만드는
// "GitHub 에서 편집" 링크가 저장소에 없는 경로를 가리킨다. filePath 가 http 로 시작하면
// 테마가 그대로 쓰므로(원본 위치로) 절대 URL 로 치환한다.
const SPEC_BLOB_BASE = 'https://github.com/KimSoungRyoul/muninn/blob/main/docs/design'

function withSpecEditLink<T extends { filePath?: string }>(metadata: T): T {
  const synced = /^content\/design\/(.+)\.mdx$/.exec(metadata.filePath ?? '')
  if (!synced) return metadata
  const name = synced[1] === 'index' ? 'README' : synced[1]
  return { ...metadata, filePath: `${SPEC_BLOB_BASE}/${name}.md` }
}

export default async function Page(props: PageProps) {
  const params = await props.params
  const { default: MDXContent, toc, metadata, sourceCode } = await importPage(params.mdxPath)
  return (
    <Wrapper toc={toc} metadata={withSpecEditLink(metadata)} sourceCode={sourceCode}>
      <MDXContent {...props} params={params} />
    </Wrapper>
  )
}
