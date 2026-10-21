import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { highlightCode } from "@/lib/highlight"

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
          code: ({ node: _node, className, children, ...props }) => {
            const lang = /language-(\S+)/.exec(className ?? "")?.[1]
            if (!lang) return <code className={className} {...props}>{children}</code>
            return <code className={className} dangerouslySetInnerHTML={{ __html: highlightCode(String(children).replace(/\n$/, ""), lang) }} />
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
