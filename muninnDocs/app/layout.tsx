import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Footer, Layout, Navbar } from 'nextra-theme-docs'
import { Head } from 'nextra/components'
import { getPageMap } from 'nextra/page-map'
import 'nextra-theme-docs/style.css'

export const metadata: Metadata = {
  title: {
    default: 'Muninn DevOps Agent Platform',
    template: '%s – Muninn'
  },
  description:
    'Kubernetes 위에서 Claude 에이전트 실행을 오케스트레이션하는 DevOps Agent Platform 문서'
}

const navbar = (
  <Navbar
    logo={
      <span style={{ fontWeight: 700 }}>
        Muninn <span style={{ fontWeight: 400, opacity: 0.7 }}>DevOps Agent Platform</span>
      </span>
    }
    projectLink="https://github.com/KimSoungRyoul/muninn"
  />
)

const footer = (
  <Footer>
    Muninn DevOps Agent Platform —{' '}
    <a href="https://github.com/KimSoungRyoul/muninn" target="_blank" rel="noreferrer">
      GitHub
    </a>
  </Footer>
)

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" dir="ltr" suppressHydrationWarning>
      <Head />
      <body>
        <Layout
          navbar={navbar}
          pageMap={await getPageMap()}
          docsRepositoryBase="https://github.com/KimSoungRyoul/muninn/tree/main/muninnDocs"
          editLink="GitHub 에서 이 페이지 편집 →"
          feedback={{ content: '질문이나 피드백 남기기 →' }}
          footer={footer}
        >
          {children}
        </Layout>
      </body>
    </html>
  )
}
